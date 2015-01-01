var util = require('gulp-util');
var Plugin = require('./plugin');

function Route(parent, url) {
	this.parent = parent;
	this.plugins = [];
	
	for (var key in this.parent.aliases) {
		var aliases;
		aliases = [key];
		aliases = aliases.concat(this.parent.aliases[key]);
		aliases = aliases.join(',');
		aliases = '{' + aliases + '}';
		// find a given alias at the end of a string
		var regexp = new RegExp(key + '$', 'g');
		url = url.replace(regexp, aliases);
	}
	
	this.url = url;
	this.glob = undefined;
}

/**
 * Defer back to the parent to set up a new Route
 * @param {String} glob
 * @returns {Route}
 */
Route.prototype.task = function(glob) {
	return this.parent.task(glob);
}

// Aliased to Route#get and Route#for
Route.prototype.get = Route.prototype.task;
Route.prototype.for = Route.prototype.task;

/**
 * Defer back to the pipeline to alias an extension
 * @param {String} ext
 * @param {String} value
 * @returns {Route}
 */
Route.prototype.alias = function(ext, value) {
	this.parent.alias(ext, value);
	return this;
}

/**
 * Use a plugin for this Route 
 * @param {Function} fn
 * @returns {Route}
 */
Route.prototype.use = function(fn, args) {
	args = Array.prototype.slice.call(arguments, 1);
	this.plugins.push(new Plugin(fn, args));
	return this;
}

/**
 * Conditionally use a plugin
 * @param {Boolean} condition
 * @param {Function} fn
 * @returns {Route}
 */
Route.prototype.when = function(condition, fn, args) {
	if (!condition) return this;
	args = Array.prototype.slice.call(arguments, 2);
	this.plugins.push(new Plugin(fn, args));
	return this;
}

/**
 * Set Route source glob
 * @param {String} glob
 * @returns {Route}
 */
Route.prototype.source = function(glob) {
	this.glob = glob;
	return this;
}

Route.prototype.src = Route.prototype.source;

/**
 * Defer to the Server's handler
 * @returns {Function}
 */
Route.prototype.middleware = function() {
	return this.parent.middleware();
}

/**
 * Attach to a stream
 * @param {Stream} stream
 * @returns {Stream}
 */
Route.prototype.attach = function(stream) {
	if (this.plugins.length) {
		this.plugins.forEach(function(plugin) {
			stream = stream.pipe.apply(null, plugin.args());
		});
	} else {
		stream = stream.pipe(util.noop);
	}
	return stream;
}

module.exports = Route;