var Plugin = require('./plugin');

function Task(parent, pattern) {
	this.parent = parent;
	this.plugins = [];
	
	Object.keys(this.parent.aliases).forEach(function(key) {
		var aliases = this.parent.aliases[key];
		aliases.push(key);
		aliases = '{' + aliases.join(',') + '}';
		// find a given alias at the end of a string
		var regexp = new RegExp(key + '$', 'g');
		pattern = pattern.replace(regexp, aliases);
	}, this);
	
	this.pattern = pattern;
	this.source = pattern;
	
}

/**
 * Defer back to the parent to set up a new task
 * @param {String} glob
 * @returns {Task}
 */
Task.prototype.get = function(glob) {
	return this.parent.get(glob);
}

/**
 * Use a plugin for this task 
 * @param {Function} fn
 * @returns {Task}
 */
Task.prototype.use = function(fn, args) {
	args = Array.prototype.slice.call(arguments, 1);
	this.plugins.push(new Plugin(fn, args));
	return this;
}

/**
 * Conditionally use a plugin
 * @param {Boolean} condition
 * @param {Function} fn
 * @returns {Task}
 */
Task.prototype.when = function(condition, fn, args) {
	if (!condition) return this;
	args = Array.prototype.slice.call(arguments, 2);
	this.plugins.push(new Plugin(fn, args));
	return this;
}

/**
 * Set task source glob
 * @param {String} glob
 * @returns {Task}
 */
Task.prototype.src = function(glob) {
	this.source = glob;
	return this;
}

/**
 * Defer to the Server's handler
 * @returns {Function}
 */
Task.prototype.middleware = function() {
	return this.parent.middleware();
}

/**
 * Attach to a stream
 * @param {Stream} stream
 * @returns {Stream}
 */
Task.prototype.attach = function(stream) {
	this.plugins.forEach(function(plugin) {
		var args = [plugin.fn].concat(plugin.options);
		stream = stream.pipe.apply(null, args);
	});
	return stream;
}

module.exports = Task;