function Plugin(fn, opts) {
	if (typeof fn !== 'function') {
		throw new TypeError('Plugin must be passed a function');
	}
	this.fn = fn;
	this.options = opts || {};
}

module.exports = Plugin;