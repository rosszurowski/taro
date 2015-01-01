var fs   = require('fs');
var path = require('path');

var async = require('async');
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
			.use(sass)
		.task('*.css')
			.use(autoprefix)
				.when('production' === env, csso)
		// scripts
		.task('libraries.js')
			.source('js/libraries/*.js')
			.use(concat, 'libraries.js')
		.task('nested.js')
			.source('js/nested/*.js')
			.use(concat, 'nested.js')
		.task('index.js')
			.use(es6)
		.task('invalid.js')
			.use(coffee)
		.task('passthrough.js')
		.task('date.js');

	return srv.middleware();

}

// Little sample application
var source = path.join(__dirname, '/fixtures');
var cache  = path.join(source, './.cache');
var deps   = path.join(source, './.dependencies');

var app = express();
app.use(assets({ root: source, cache: cache, dependencies: deps }));
app.use(function(req, res, next) {
	var err = new Error();
	err.status = 404;
	return next(err);
});
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
	beforeEach(function(done) {
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
		async.parallel([
			function(next) {
				request
					.get('/styles.scss')
					.expect(200)
					.expect('Content-Type', /css/)
					.end(next);
			},
			function(next) {
				request
					.get('/index.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(next);
			}
		], done);
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
	
	it ('should 200 for concat-style tasks', function(done) {
		request
			.get('/libraries.js')
			.expect(200)
			.expect('Content-Type', /javascript/)
			.end(function(err, res) {
				res.text.should.equal('var a = 5;\nvar b = 8;');
				done()
			});
	})
	
	it ('should 200 for files without plugins', function(done) {
		request
			.get('/passthrough.js')
			.expect(200)
			.end(function(err, res) {
				res.text.should.equal('let hi = 5;');
				done();
			});
	});
	
	it ('should cache requests', function(done) {
		var uncached, cached;
		async.series([
			function (next) {
				uncached = Date.now();
				request
					.get('/styles.css')
					.expect(200)
					.expect('Content-Type', /css/)
					.end(next);
			},
			function (next) {
				uncached = Date.now() - uncached;
				cached = Date.now();
				request
					.get('/styles.css')
					.expect(200)
					.expect('Content-Type', /css/)
					.end(next);
			},
			function(next) {
				cached = Date.now() - cached;
				next();
			}
		], function(err) {
			should.not.exist(err);
			cached.should.be.below(uncached);
			fs.exists(path.join(cache, '/styles.css'), function(exists) {
				exists.should.be.true;
				done();
			});
		});
	});
	
});
	
describe('GET /invalid/syntax/asset', function() {
	
	it ('should pass compilation errors forward', function(done) {
		request
			.get('/invalid.css')
			.expect(500)
			.end(function(err, res) {
				should.exist(res.body);
				should.exist(res.body.message);
				should.exist(res.body.plugin);
				done();
			});
	});
	
});
	
	
describe('GET /changed/asset', function() {
	
	it ('should recompile on changes', function(done) {
		
		var date;
		
		async.series([
			function(next) {
				request
					.get('/date.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(function(err, res) {
						res.text.length.should.be.above(0);
						// OS X has a 1sec file modified time resolution
						setTimeout(next, 1005);
					});
			},
			function(next) {
				date = Date.now().toString();
				fs.writeFile(path.join(source, 'date.js'), date, next);
			},
			function(next) {
				request
					.get('/date.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(function(err, res) {
						res.text.should.equal(date);
						next();
					})
			}
		], done);

	});
	
	it ('should recompile on changes to required source files', function(done) {
		
		request
			.get('/nested.js')
			.expect(200)
			.expect('Content-Type', /javascript/)
			.end(function(err, res) {
				res.text.length.should.be.above(0);
				setTimeout(second, 1000);
			});
			
		function second() {
			var date = Date.now().toString();
			fs.writeFile(path.join(source, 'js', 'nested', 'b.js'), date, function(err) {
				if (err) return done(err);
				request
					.get('/nested.js')
					.expect(200)
					.expect('Content-Type', /javascript/)
					.end(function(err, res) {
						res.text.should.equal('hi;\n' + date + '\nyo;');
						done();
					});
			});
		}
	});

	
});