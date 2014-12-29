var fs = require('fs');
var path = require('path');

var async = require('async');
var debug = require('debug')('express:assets');
var express = require('express');
var send = require('send');

var glob = require('glob');
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


var Server = module.exports = function(options) {
	
	if (!options.root) throw new TypeError('options.root must be set');
	
	this.root = options.root;
	this.dependencies = options.dependencies || path.join(options.root, '/.dependencies');
	this.cache = options.cache || path.join(options.root, '/.cache');
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
Server.prototype.task = function(glob) {
	var route = new Route(this, glob);
	this.routes.push(route);
	return route;
}

// Aliased as Server#get and Server#for
Server.prototype.get = Server.prototype.task;
Server.prototype.for = Server.prototype.task;

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
	
	var server = this;
	var result, source;
	
	// cached
	async.series([
		search,
		cached,
		sourced
	], function(err) {
		if (err) return done(err);
		if (result) return done(null, result);
		// otherwise, don't return anything
		debug('Could not resolve %s', req.path);
		done(null, false);
	});
	
	function search(next) {
		var patterns = [];
		req.routes.forEach(function(route) {
			if (!!~patterns.indexOf(route.source)) return;
			patterns.push(route.source);
		});
		glob(patterns.join(','),
			{ cwd: server.root, nomount: true, nodir: true },
			function(err, files) {
				if (err) return next(err);
				files = files.filter(function(file) {
					normalized = trim(req.path.replace(path.extname(req.path), ''));
					return file.indexOf(normalized) !== -1;
				});
				source = files.length > 1 ? files : files[0] || undefined;
				next();
			});
	}
	
	function cached(next) {
		
		var cachedPath = path.join(server.cache, req.path);
		// TODO: check the mtime of all source files, not just the first
		var sourcePath = path.join(server.root, Array.isArray(source) ? source[0] : source);
		
		fs.exists(cachedPath, function(exists) {
			if (!exists) return next();
			async.series({
				cache: fs.stat.bind(this, cachedPath),
				source: fs.stat.bind(this, sourcePath)
			}, function(err, results) {
				if (err) return next(err);
				if (results.cache.mtime.getTime() < results.source.mtime.getTime()) return next();
				result = { url: req.path, path: cachedPath, cached: true };
				next(null)
			});
		});
	}
	
	function sourced(next) {
		if (!source) return next();
		result = { url: req.path, path: source, cached: false };
		next();
	}
}

/**
 * Middleware to resolve a given file
 */
Server.prototype.find = function() {
	var server = this;
	return function(req, res, next) {
		
		// get routes that match current route
		req.routes = server.routes.filter(function(task) {
			return match(trim(req.path), task.url);
		});
		
		if (!req.routes.length) {
			debug('No routes matching request %s', req.path);
			return next(new NotFoundError());
		}

		// resolve the file for the current request
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
		
		debug('Compiling %s', req.source);
		var stack = compiler(req);
		
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
 * @api private
 */
function compiler(req) {
	var compiler = lazypipe();
	req.routes.forEach(attach);
	return req.routes.length > 0 ? compiler : util.noop;
	function attach(route) {
		compiler = route.attach(compiler);
	}
}


/**
 * Serve static files with `send`
 * @param {String} file
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @api private
 */
function serve(file, req, res, next) {
	return send(req, file, { index: false })
		.on('error', next)
		.on('directory', forbidden)
		.pipe(res);
		
	function forbidden() {
		return next(new ForbiddenError());
	}
}

/**
 * Trims leading and trailing slashes from URLs
 * @param {String} input
 * @returns {String} output
 * @api private
 */
function trim(input) {
	return input.replace(/^\/|\/$/g, '');
}