var Plugin = require('./plugin');

function Route(parent, url) {
	this.parent = parent;
	this.plugins = [];
	
	for (var key in this.parent.aliases) {
		var aliases = this.parent.aliases[key];
		aliases.push(key);
		aliases = '{' + aliases.join(',') + '}';
		// find a given alias at the end of a string
		var regexp = new RegExp(key + '$', 'g');
		url = url.replace(regexp, aliases);
	}
	
	this.url = url;
	this.source = url;
	
}

/**
 * Defer back to the parent to set up a new Route
 * @param {String} glob
 * @returns {Route}
 */
Route.prototype.get = function(glob) {
	return this.parent.get(glob);
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
Route.prototype.src = function(glob) {
	this.source = glob;
	return this;
}

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
	this.plugins.forEach(function(plugin) {
		var args = [plugin.fn].concat(plugin.options);
		stream = stream.pipe.apply(null, args);
	});
	return stream;
}

module.exports = Route;