var fs = require('fs');
var path = require('path');
var express = require('express');
var send = require('send');

var debug = require('debug')('express:assets');
var gulp = require('gulp');
var newer = require('gulp-newer');
var map = require('map-stream');
var merge = require('object-merge');
var through = require('through');
var glob = require('glob').sync;
var match = require('minimatch');

var errors = require('./errors');

var Task = require('./task');
var NotFoundError  = errors.NotFoundError;
var ForbiddenError = errors.ForbiddenError;

var production = 'production' === process.env.NODE_ENV;

var Server = module.exports = function(root) {
	
	this.root = root;
	this.dependencies = path.join(root, '/.dependencies');
	this.cache = path.join(root, '/.cache');
	this.plugins = [];
	this.tasks = [];
	this.aliases = {};
	
	// common aliases
	this.alias('css', 'scss');
	this.alias('css', 'sass');
	this.alias('css', 'less');
	this.alias('js',  'coffee');
	
	return this;

}

/**
 * Create a new task based on a matching `glob` condition
 * @param {String} glob
 * @returns {Task}
 */
Server.prototype.get = function(glob) {
	var task = new Task(this, glob);
	this.tasks.push(task);
	return task;
}

/**
 * Alias an `ext` to another `value`
 * 
 * @param {String} ext
 * @param {String} value
 * @returns {Server}
 */
Server.prototype.alias = function(ext, value) {
	if (typeof ext === 'string' && typeof value === 'string') {
		value = value.replace(/^\./g, '');
		if (this.aliases[ext]) {
			if (this.aliases[ext].indexOf(value) === -1) {
				this.aliases[ext].push(value);
			}
		} else {
			this.aliases[ext] = [value];
		}
	} else if (Object.prototype.toString.call(ext) === '[object Object]') {
		this.aliases = merge(this.aliases, ext);
	} else {
		throw new Error('Pass an object or string arguments to Server#alias');
	}
	return this;
}

/**
 * Use a plugin for all files
 * @param {Function} fn
 * @returns {Server}
 */
Server.prototype.use = function(fn) {
    // don't allow duplicates
    if (!!~this.plugins.indexOf(fn)) return this;
    this.plugins.push(fn);
    return this;
}

/**
 * Attach tasks to a stream
 * @param {Stream}  stream
 * @param {Request} req
 * @returns {Stream}
 */
Server.prototype.attach = function(stream, req) {
	this.plugins.forEach(function(transform) {
		stream = stream.pipe(transform);
	});
	if (!req.source) return stream;
	this.tasks.forEach(function(task) {
		if (!match(req.source, task.pattern, { matchBase: true })) return;
		stream = task.attach(stream);
	});
	return stream;
}


/**
 * Resolve a requested URL to the correct file
 * 
 * @param {String} url
 * @param {Function} done    (err, path)
 * @returns {String} path
 */
Server.prototype.resolve = function(req, done) {
	var files, file, normalized;
	// cached
	// TODO: check if source is newer
	file = path.join(this.cache, req.path);
	if (fs.existsSync(file)) return done(null, { url: req.path, path: file, cached: true });
	// source
	files = glob(req.tasks[0].pattern, { cwd: this.root, nomount: true, nodir: true });
	for (var i = 0, l = files.length; i < l; i++) {
		// check if theres a match anywhere in the string
		file = files[i];
		normalized = trim(req.path.replace(path.extname(req.path), ''));
		if (file.indexOf(normalized) === -1) continue;
		debug('Request %s matched to %s', req.path, file);
		return done(null, { url: req.path, path: file, cached: false });
	}
	debug('Could not resolve');
	done(null, false);
	// false
}

Server.prototype.find = function() {
	var server = this;
	return function(req, res, next) {
		
		// we're declaring gulp 'routes'
		// if a request matches that route, load the task
		// resolve the file, and run things
		var url = trim(req.path);
		
		// get tasks that match current route
		req.tasks = server.tasks.filter(function(task) {
			return match(url, task.pattern);
		});
		
		if (!req.tasks.length) {
			debug('No tasks matching request %s', req.path);
			return next(new NotFoundError());
		}

		// resolve the file for the current path
		server.resolve(req, function(err, file) {
			if (err) return next(err);
			if (!file) {
				debug('No file found for %s', req.path);
				return next(new NotFoundError());
			} else if (file.cached) {
				debug('Using cached %s', file.path.replace(server.root, ''));
				req.output = file.path;
				return next();
			}
			debug('Using source %s', file.path);
			req.source = file.path;
			next();
		});

	}
}

Server.prototype.compile = function() {
	var server = this;
	return function(req, res, next) {

		// if we already have content, don't compile anything
		if (req.output) return next();
		
		var stream, file;
		
		debug('Compiling %s', req.source);
		stream = gulp.src(req.source, { cwd: server.root })
			// .pipe(newer(server.cache));
		stream = server.attach(stream, req);
		stream
			.pipe(gulp.dest(server.cache, { cwd: server.root }))
			.pipe(map(end))
			.on('error', next)
			
		function end(vinyl, done) {
			file = vinyl;
			debug('Compiled %s => %s', req.source, file.path.replace(server.root, ''));
			req.output = file.path;
			next();
		}

	}
}

/**
 * Output middleware for handling incoming requests
 * @returns {Function}
 */
Server.prototype.handler = function() {

	var server = this;
	var router = express.Router();
	
	console.log(server.compile())
	
	router.use(server.find());
	router.use(server.compile());
	router.use(function(req, res, next) {
		debug('Serving %s', req.output.replace(server.root, ''));
		return serve(req.output, req, res, next);
	});
	
	return router;

}


function serve(file, req, res, next) {
	return send(req, file, { index: false })
		.on('error', next)
		.on('directory', forbidden)
		.pipe(res);
		
	function forbidden() {
		return next(new ForbiddenError());
	}
}

function trim(str) {
	return str.replace(/^\/|\/$/g, '');
}