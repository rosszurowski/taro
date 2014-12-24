var path    = require('path');
var should  = require('should');
var express = require('express');
var request = require('supertest');
var Server  = require('..');

// asset server requires
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

// Asset server

function assets(root) {

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

// Little sample application
var app = express();
app.use(assets(path.join(__dirname, '/assets')));
app.use(function(err, req, res, next) {
	var status = err.status || 500;
	console.log('error', err.message, err.stack);
	res.status(status).end();
});
// load it into supertest
request = request(app);

describe('GET /path/to/asset', function() {
	
	// increasing the timeout, because for things like duo, it can take over
	// 2000ms for the initial grab
	this.timeout(2500);
	
	it ('should 404 for nonexistent files', function(done) {
		request
			.get('/yo/hi.js')
			.expect(404)
			.end(done);
	});
	
	it ('should 404 for directories', function(done) {
		request
			.get('/css/')
			.expect(404)
			.end(done);
	});
	
	it ('should 404 for dotfiles', function(done) {
		request
			.get('/css/.test')
			.expect(404)
			.end(done);
	});
	
	it ('should 200 for valid files', function(done) {
		request
			.get('/styles.scss')
			.expect(200)
			.expect('Content-Type', /css/)
			.end(function(err, res) {
				request
					.get('/index.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(done);
			});
	});
	
	it ('should 200 for nested files', function(done) {
		request
			.get('/css/another.css')
			.expect(200)
			.expect('Content-Type', /css/)
			.end(done);
	});
	
	it ('should 200 for aliased extensions', function(done) {
		request
			.get('/styles.css')
			.expect(200)
			.expect('Content-Type', /css/)
			.end(done);
	})
	
});