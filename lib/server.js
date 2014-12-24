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

// Server.prototype.getOld = function() {
//     var server = this;
//     return function(req, res, next) {
//         var file;
//         // if the cached version exists, use it
//         file = path.join(server.cache, req.path);
//         if (fs.existsSync(file)) {
//             debug('Using cached %s', req.path);
//             req.output = file;
//             return next();
//         }
//         // otherwise check if a source file exists
//         file = path.join(server.root, req.path);
//         if (fs.existsSync(file)) {
//             debug('Using source %s', file.replace(server.root, ''));
//             req.source = file;
//             return next();
//         }
//         // otherwise check any aliases
//         var ext = path.extname(req.path);
//         var aliases = server.aliases[ext.replace(/^\./, '')] || [];
//         for (var i = 0, l = aliases.length; i < l; i++) {
//             var alias = aliases[i];
//             file = path.join(server.root, req.path.replace(ext, '') + '.' + alias);
//             // console.log(task.glob, req.source, match(req.source, task.glob, { matchBase: true }));
//             if (!fs.existsSync(file)) continue;
//             debug('Using source %s', file.replace(server.root, ''));
//             req.source = file;
//             return next();
//         }
//         // otherwise throw a 404
//         debug('No file found for %s', req.path);
//         return next(new NotFoundError());
//     }
// }

/**
 * Resolve a requested URL to the correct file
 * 
 * @param {String} url
 * @param {Function} done    (err, path)
 * @returns {String} path
 */
Server.prototype.resolve = function(url, done) {
	var file;
	// cached
	// TODO: check if source is newer
	file = path.join(this.cache, url);
	if (fs.existsSync(file)) return done(null, { url: url, path: file, cached: true });
	// source
	file = path.join(this.root, url);
	if (fs.existsSync(file)) return done(null, { url: url, path: file, cached: false });
	// source alias
	// -- unless none of them exist
	done(null, false);
	// false
}

Server.prototype.find = function() {
	var server = this;
	return function(req, res, next) {
		
		// we're declaring gulp 'routes'
		// if a request matches that route, load the task
		// resolve the file, and run things
		
		// get tasks that match current route
		// req.tasks = server.tasks.filter(function(task) {
		// 	return match(req.path, task.pattern);
		// });

		// resolve the file for the current path
		server.resolve(req.path, function(err, file) {
			if (err) return next(err);
			if (file.cached) {
				debug('Using cached %s', req.path);
				req.output = file.path;
				return next();
			} else if (file.path) {
				debug('Using source %s', file.url);
				req.source = file.path;
				return next();
			}
			debug('No file found for %s', req.path);
			next(new NotFoundError());
		});

	}
}

Server.prototype.compile = function() {
	var server = this;
	return function(req, res, next) {
		
		// if we already have content, don't compile anything
		if (req.output) return next();
		
		var stream, file;
		
		console.log(req.source);
		
		stream = gulp.src(req.source, { base: server.root })
			// .pipe(newer(server.cache));
		stream = server.attach(stream, req);
		stream
			.pipe(gulp.dest(server.cache, { cwd: server.root }))
			.pipe(map(end))
			.on('error', next)
			
		function end(vinyl, done) {
			file = vinyl;
			console.log(file);
			debug('Compiled %s => %s', req.source.replace(server.root, ''), file.path.replace(server.root, ''));
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

	var srv = this;
	var router = express.Router();
	
	router.use(srv.find());
	router.use(srv.compile());
	
	router.get('*', function(req, res, next) {
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