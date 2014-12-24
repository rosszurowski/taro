# Express Asset Pipeline

A simple and extensible asset pipeline server for [Express](http://expressjs.com/), that uses [gulp](gulpjs.com) to process files.

## Installation

```bash
npm install express-asset-pipeline
```

## Usage

Express Asset Pipeline offers a [superagent](https://github.com/visionmedia/superagent)-esque chainable system for describing how your files should be processed.

```javascript

var express = require('express');
var app = express();

var Pipeline = require('express-asset-pipeline');

function pipeline() {

	var server = new Pipeline()
		.task('*.scss')
			.use(sass())
			.use(autoprefix())
				.use(check('production' === process.env.NODE_ENV, csso()))
		.task('*.js')
			.use(duo())
			.use(es6())
				.use(check('production' === process.env.NODE_ENV, uglify()))
		.task('img/*.{png,jpg,gif}')
			.use(imagemin());
			
	return server.handler();

}
```

Putting the above example in its own module has the advantage of cleanly separating your app's dependencies from the swath of gulp plugins.

## Performance

This package caches compiled files and serves from the cache to ensure fast response times. Files are only re-compiled when needed.

## License

MIT