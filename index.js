var Server  = require('./lib/server');

var path = require('path');
var map = require('map-stream');
var check = require('gulp-if');

var sass = require('gulp-sass');
var autoprefix = require('gulp-autoprefixer');
var csso = require('gulp-csso');

var Duo = require('duo');
var concat = require('gulp-concat');
var es6 = require('gulp-6to5');
var uglify = require('gulp-uglify');

var env = process.env.NODE_ENV;

module.exports = function(root) {
	
	var srv = new Server(root)
		// styles
		// run on all scss files regardless of where they are in the path
		.get('**/*.css')
			.src('**/*.scss')
			.use(sass())
			.use(autoprefix())
				.use(check('production' === env, csso()))
		// // scripts
		// run only on first-level javascript files
		.get('libraries.js')
			.src('js/libraries/*.js')
			.use(concat('libraries.js'))
		.get('index.js')
			.use(duo({ root: root, components: './.dependencies' }))
			.use(es6())
				.use(check('production' === env, uglify()))

	return srv.handler();
	
}

/**
 * Prep duo for gulp streams
 * @param {Object} opts
 */
function duo(opts) {
	opts = opts || {};
	var compiler = new Duo(opts.root);
	if (opts.components) compiler.installTo(opts.components);
	return map(function(file, done) {
		compiler.entry(file.path)
		.run(function(err, src) {
			if (err) return fn(err);
			file.contents = new Buffer(src);
			done(null, file);
		});
	});
}