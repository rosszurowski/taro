var fs = require('fs');
var path = require('path');
var express = require('express');
var send = require('send');

var debug = require('debug')('express:assets');
var glob = require('glob').sync;
var gulp = require('gulp');
var tap = require('gulp-tap');
var util = require('gulp-util');
var merge = require('object-merge');
var match = require('minimatch');
var lazypipe = require('lazypipe');

var errors = require('./errors');

var Route = require('./route');
var NotFoundError  = errors.NotFoundError;
var ForbiddenError = errors.ForbiddenError;

var production = 'production' === process.env.NODE_ENV;

var Server = module.exports = function(root) {
	
	this.root = root;
	this.dependencies = path.join(root, '/.dependencies');
	this.cache = path.join(root, '/.cache');
	this.routes = [];
	this.aliases = Object.create(null);
	
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
	var route = new Route(this, glob);
	this.routes.push(route);
	return route;
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
 * Resolve a requested URL to the correct file
 * 
 * @param {String} url
 * @param {Function} done    (err, path)
 * @returns {String} path
 */
Server.prototype.resolve = function(req, done) {
	
	// get source files
	var patterns = [];
	req.routes.forEach(function(route) {
		if (!!~patterns.indexOf(route.source)) return;
		patterns.push(route.source);
	});

	var files = glob(patterns.join(','), { cwd: this.root, nomount: true, nodir: true });
	files = files.filter(function(file) {
		normalized = trim(req.path.replace(path.extname(req.path), ''));
		return file.indexOf(normalized) !== -1;
	});
	var source;
	if (files.length > 1) source = files;
	else if (files.length === 1) source = files[0];



	// cached
	var cached = path.join(this.cache, req.path);
	if (fs.existsSync(cached)) {
		var cacheStat = fs.statSync(cached);
		var p = path.join(this.root, typeof source === 'array' ? source[0] : source);
		var sourceStat = fs.statSync(p);
		if (cacheStat.mtime.getTime() >= sourceStat.mtime.getTime()) {
			debug('Using cached %s', source.replace(this.root, ''));
			return done(null, { url: req.path, path: cached, cached: true });
		}
	}

	if (source) {
		debug('Request %s matched to %s', req.path, source);
		return done(null, { url: req.path, path: source, cached: false });
	}
	
	// otherwise, don't return anything
	debug('Could not resolve %s', req.path);
	done(null, false);
}

Server.prototype.find = function() {
	var server = this;
	return function(req, res, next) {
		
		// we're declaring gulp 'routes'
		// if a request matches that route, load the task
		// resolve the file, and run things
		var url = trim(req.path);
		
		// get tasks that match current route
		req.routes = server.routes.filter(function(task) {
			return match(url, task.url);
		});
		
		if (!req.routes.length) {
			debug('No routes matching request %s', req.path);
			return next(new NotFoundError());
		}

		// resolve the file for the current path
		server.resolve(req, function(err, file) {
			if (err) return next(err);
			if (!file) {
				debug('No file found for %s', req.path);
				return next(new NotFoundError());
			} else if (file.cached) {
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
		
		debug('Compiling %s', req.source);
		var stack = server.compiler(req);
		
		gulp.src(req.source, { base: server.root, cwd: server.root })
			.pipe(stack())
			.pipe(gulp.dest(server.cache))
			.pipe(tap(read))
			.on('error', next)
			.on('end', next);
		
		function read(file) {
			debug('Compiled %s => %s', req.source, file.path.replace(server.root, ''));
			req.output = file.path;
		}

	}
}

/**
 * Output middleware for handling incoming requests
 * @returns {Function}
 */
Server.prototype.middleware = function() {

	var server = this;
	var router = express.Router();
	
	router.use(server.find());
	router.use(server.compile());
	router.use(function(req, res, next) {
		debug('Serving %s', req.output.replace(server.root, ''));
		return serve(req.output, req, res, next);
	});
	
	return router;

}

/**
 * Output lazypipe stack for compiling assets for `req`
 * @param {Request} req
 * @returns {LazyPipe}
 */
Server.prototype.compiler = function(req) {
	var compiler = lazypipe();
	req.routes.forEach(attach);
	return req.routes.length > 0 ? compiler : util.noop;
	
	function attach(route) {
		compiler = route.attach(compiler);
	}
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