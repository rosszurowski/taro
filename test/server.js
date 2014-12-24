var path    = require('path');
var should  = require('should');
var express = require('express');
var request = require('supertest');
var assets  = require('..');

// Little sample application
var app = express();
app.use(assets(path.join(__dirname, '/assets')));
app.get('*', function(req, res, next) {
	res.status(404).send('Page not found');
});
app.use(function(err, req, res, next) {
	var status = err.status || 500;
	// console.log(err.message);
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
	
	it ('should 403 for directories', function(done) {
		request
			.get('/css/')
			.expect(403)
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