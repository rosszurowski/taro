var fs   = require('fs');
var path = require('path');

var rimraf = require('rimraf');
var should  = require('should');
var express = require('express');
var request = require('supertest');
var Server  = require('..');

// asset server requires
var concat = require('gulp-concat');
var coffee = require('gulp-coffee');
var sass = require('gulp-sass');
var autoprefix = require('gulp-autoprefixer');
var csso = require('gulp-csso');
var es6 = require('gulp-6to5');

var env = process.env.NODE_ENV;

// Asset server

function assets(opts) {

	var srv = new Server(opts)
		// styles
		.task('**/*.css')
			.src('**/*.scss')
			.use(sass)
		.task('*.css')
			.src('**/*.scss')
			.use(autoprefix)
				.when('production' === env, csso)
		// scripts
		.task('libraries.js')
			.src('js/libraries/*.js')
			.use(concat, 'libraries.js')
		.task('index.js')
			.use(es6)
		.task('invalid.js')
			.use(coffee)
		.task('passthrough.js')
		.task('date.js')
			.use(concat, 'date.js');

	return srv.middleware();

}

// Little sample application
var source = path.join(__dirname, '/fixtures');
var cache  = path.join(source, './.cache');
var deps   = path.join(source, './.dependencies');

var app = express();
app.use(assets({ root: source, cache: cache, dependencies: deps }));
app.use(function(err, req, res, next) {
	var status = err.status || 500;
	res.status(status).json(err);
});
// load it into supertest
request = request(app);


describe('GET /path/to/asset', function() {
	
	// increasing the timeout, because for things like duo, it can take over
	// 2000ms for the initial grab
	this.timeout(2750);
	
	// clear the cache
	before(function(done) {
		rimraf(cache, function(err) {
			if (err) return done(err);
			rimraf(deps, done);
		})
	});
	
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
	});
	
	it ('should work with concat-style tasks', function(done) {
		request
			.get('/libraries.js')
			.expect(200)
			.expect('Content-Type', /javascript/)
			.end(function(err, res) {
				res.text.should.equal('var a = 5;\nvar b = 8;');
				done()
			});
	})
	
	it ('should cache requests', function(done) {
		request
			.get('/styles.css')
			.expect(200)
			.expect('Content-Type', /css/)
			.end(function(err, res) {
				should.not.exist(err);
				fs.exists(path.join(cache, '/styles.css'), function(exists) {
					exists.should.be.true;
					done();
				})
			})
	});
	
	it ('should recompile on changes', function(done) {
		
		this.timeout(3000);
		
		request
			.get('/date.js')
			.expect(200)
			.expect('Content-Type', /javascript/)
			.end(function(err, res) {
				res.text.length.should.be.above(0);
				// OS X has a 1sec file modified time resolution
				setTimeout(second, 1000);
			});
			
		function second() {
			var date = Date.now().toString();
			fs.writeFile(path.join(source, 'date.js'), date, function(err) {
				if (err) return done(err);
				request
					.get('/date.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(function(err, res) {
						res.text.should.equal(date);
						done();
					})
			})
		}
	});
	
	it ('should pass compilation errors forward', function(done) {
		
		request
			.get('/invalid.js')
			.expect(500)
			.end(function(err, res) {
				should.exist(res.body);
				should.exist(res.body.message);
				should.exist(res.body.plugin);
				done();
			});
		
	});
	
	it ('should pass-through files without plugins', function(done) {
		
		request
			.get('/passthrough.js')
			.expect(200)
			.end(function(err, res) {
				res.text.should.equal('let hi = 5;');
				done();
			})
		
	});
	
});