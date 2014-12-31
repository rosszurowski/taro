/**
 * Simple wrapper around Gulp plugins
 * 
 */
function Plugin(fn, opts) {
	if (typeof fn !== 'function') {
		throw new TypeError('Plugin must be passed a function');
	}
	this.fn = fn;
	this.options = opts || {};
}

/**
 * Get function arguments as array
 * @returns {Array}
 */
Plugin.prototype.args = function() {
	return [this.fn].concat(this.options)
}

module.exports = Plugin;