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
	
	console.log(pattern);
	
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
Task.prototype.use = function(fn) {
	if (!!~this.plugins.indexOf(fn)) return this;
	this.plugins.push(fn);
	return this;
}

Task.prototype.src = function(glob) {
	this.source = glob;
	return this;
}

/**
 * Defer to the Server's handler
 * @returns {Function}
 */
Task.prototype.handler = function() {
	return this.parent.handler();
}

/**
 * Attach the task to a stream
 * @param {Stream} stream
 * @returns {Stream}
 */
Task.prototype.attach = function(stream) {
	this.plugins.forEach(function(fn) {
		stream = stream.pipe(fn);
	});
	return stream;
}

module.exports = Task;