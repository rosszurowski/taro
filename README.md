# Taro

An extensible asset pipeline server for [Express](http://expressjs.com/), that uses [gulp](gulpjs.com) to process files. 

**WIP:** This project is still in progress and is not ready for production use.

## Installation

```bash
$ npm install taro --save
```

## Usage

Taro offers a [superagent](https://github.com/visionmedia/superagent)-esque chainable system for describing how your files should be processed.

```javascript

var express = require('express');
var app = express();

var Pipeline = require('taro');

function pipeline() {
	var server = new Pipeline({ root: './assets' })
		.get('**/*.css')
			.src('**/*.scss')
			.use(sass) // note that we don't call sass()
			.use(autoprefix, { browsers: ['last 2 versions'] }) // we can pass plugin options in subsequent arguments
				.when('production' === process.env.NODE_ENV, csso)
		.get('*.js')
			.use(6to5)
				.when('production' === process.env.NODE_ENV, uglify)
		.get('img/*.{png,jpg,gif}')
			.use(imagemin);
	return server.middleware();
}
```

Putting the above example in its own module has the advantage of cleanly separating your app's dependencies from the swath of gulp plugins used to compile your front-end.

## Performance

This package caches compiled files and serves from the cache to ensure fast response times. Files are only re-compiled when a newer source file is found.

## Tests

To run the tests simply use:

```bash
npm install
npm test
```

## License

MIT