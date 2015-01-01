var fs = require('fs');
var join = require('path').join;
var rel = require('path').relative;

var async = require('async');
var debug = require('debug')('taro');
var send = require('send');

var gulp = require('gulp');
var tap = require('gulp-tap');
var util = require('gulp-util');
var merge = require('object-merge');
var match = require('minimatch');
var lazypipe = require('lazypipe');

var Glob = require('glob').Glob;
var errors = require('./errors');

var Route = require('./route');
var ForbiddenError = errors.ForbiddenError;

var production = 'production' === process.env.NODE_ENV;


var Server = module.exports = function(options) {
	
	if (!options.root) throw new TypeError('options.root must be set');
	
	this.root = options.root;
	this.dependencies = options.dependencies || join(options.root, '/.dependencies');
	this.cache = options.cache || join(options.root, '/.cache');
	this.force = options.force || false;
	this.production = options.production || 'production' === process.env.NODE_ENV;

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
			this.aliases[ext] = [ext, value];
		}
	} else if (Object.prototype.toString.call(ext) === '[object Object]') {
		this.aliases = merge(this.aliases, ext);
	} else {
		throw new Error('Pass an object or string arguments to Server#alias');
	}
	return this;
}

/**
 * Run all tasks in a syncronous fashion
 * @returns {Server}
 */
Server.prototype.precompile = function() {
	// TODO
	return this;
}

/**
 * Output middleware for handling incoming requests
 * @returns {Function}
 */
Server.prototype.middleware = function() {
	var server = this;
	return function(req, res, next) {
		if ('GET' !== req.method && 'HEAD' !== req.method) return next();

		// If there aren't any routes defined that match the url, move on
		req.tasks = server.routes.filter(function(route) { return match(trim(req.path), route.url) });
		if (!req.tasks || !req.tasks.length) {
			debug('No routes matching request %s', req.path);
			return next();
		}
		
		// get all task sources as a glob
		var sources = req.tasks.map(function(r) { return r.glob; }).filter(unique).join(',');
		
		// get all necessary data from the request
		req.cached = join(server.cache, req.path);
		// if tasks have overridden sources, use that, otherwise use the requested file
		req.source = sources.length ? sources : join(server.root, alias(req.path));
		
		// get source files
		var glob = new Glob(req.source, { cwd: server.root, nomount: true, nodir: true, stat: true }, function(err, matches) {
			if (err) return next(err);
			if (!glob.found.length) return next();
			
			// if forced compile is enabled, compile without checking
			if (server.force === true) return compile();
			
			// check if we have a cached file that is equal or newer than the source files
			fs.stat(req.cached, function(err, cached) {
				if (err) {
					return 'ENOENT' === err.code
						? compile()
						: next(err);
				}

				var stats = Object.keys(glob.statCache)
					// only get non-false values
					.filter(function(k) { return glob.statCache[k]; })
					// return the stat values
					.map(function(k) { return glob.statCache[k]; });

				// find the latest source file
				var source = stats.reduce(function(a, b) { return a.mtime > b.mtime ? a : b });
				if (source.mtime > cached.mtime) return compile();
				serve(req.cached);
			});
			
		});
		
		/**
		 * Compile and serve the current `req.source` with `req.tasks`
		 * @api private
		 */
		function compile() {
			debug('Compiling %s', unroot(req.source));
			server.compile(req.source, req.tasks, function(err, file) {
				if (err) return next(err);
				if (!file) return next();
				debug('Compiled %s => %s', unroot(req.source), unroot(file));
				serve(file);
			});
		}
		
		/**
		 * Serve static files with `send`
		 * @param {String} path
		 * @api private
		 */
		function serve(path) {
			debug('Serving %s', unroot(path));
			return send(req, path, { index: false })
				.on('error', next)
				.on('directory', forbidden)
				.pipe(res);
		
			function forbidden() {
				return next(new ForbiddenError());
			}
		}
	}
	
	function unroot(input) {
		return input.replace(server.root, '');
	}
	
	function alias(input) {
		var ext = input.replace(/.*[\.\/\\]/, '').toLowerCase();
		var aliases = server.aliases[ext];
		if (!aliases || !aliases.length) return input;
		input = input.replace(/\.[^\.]+$/, '.{' + aliases.join(',') + '}');
		return input;
	}
}


/**
 * Process the files for the current request
 * @param {String} path
 * @param {Array} tasks
 * @param {Function} callback
 * @returns {Boolean}
 */
Server.prototype.compile = function(path, tasks, callback) {

	var stack = compiler();
	var result;
	
	gulp.src(path, { base: this.root, cwd: this.root })
		.pipe(stack())
		.on('error', error)
		.pipe(gulp.dest(this.cache))
		.pipe(tap(read))
		.on('end', end);
	
	function read(file) {
		result = file.path;
	}
	
	function error(e) {
		this.end();
		var err = new Error();
		err.status = 500;
		err.type = e.type || e.name || 'Error';
		err.message = e.message;
		err.lineNumber = e.lineNumber;
		err.filename = e.filename || e.file || path;
		err.plugin = e.plugin;
		callback(err);
	}
	
	function end() {
		callback(null, result);
	}
	
	/**
	 * Output lazypipe stack for compiling assets for `req`
	 * @param {Request} req
	 * @returns {LazyPipe}
	 * @api private
	 */
	function compiler() {
		var pipe = lazypipe();
		tasks.forEach(function(r) { pipe = r.attach(pipe); });
		return tasks.length ? pipe : util.noop;
	}
}

/**
 * An `Array.filter` callback that only allows one instance of each value
 * @returns {Boolean}
 * @api private
 */
function unique(val, index, arr) {
	return index === arr.lastIndexOf(val);
}

/**
 * Trims leading and trailing slashes from URLs
 * @param {String} input
 * @returns {String}
 * @api private
 */
function trim(input) {
	return input.replace(/^\/|\/$/g, '');
}