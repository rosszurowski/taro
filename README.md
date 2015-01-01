# Taro [![Circle CI](https://circleci.com/gh/rosszurowski/taro.svg?style=svg&circle-token=95b8acade8ecb29f54c72ede6969c33b8566560d)](https://circleci.com/gh/rosszurowski/taro)

An extensible asset-pipeline for [Express](http://expressjs.com/), that uses [gulp](gulpjs.com) and plugins to process files. 

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

var Taro = require('taro');

function taro() {
	return new Taro({ root: './assets' })
		.get('**/*.css')
			.src('**/*.scss')
			.use(sass)
			.use(autoprefix, { browsers: ['last 2 versions'] })
				.when('production' === process.env.NODE_ENV, csso)
		.get('*.js')
			.use(6to5)
				.when('production' === process.env.NODE_ENV, uglify)
		.get('img/*.{png,jpg,gif}')
			.use(imagemin);
		.middleware();
}

app.use('/assets/', taro());
```

You can also package Taro in a local module, which has the advantage of cleanly separating your app's dependencies from the swath of gulp plugins used to compile your front-end.

## API

Taro can be broken down into two components: a `Server` and set of `Task`s.

#### Server#get(glob)

Create a new task that runs when the request matches `glob`. By default, this task loads the requested file unless overridden by `Server#source`.

```javascript
taro.get('**/*.css') // runs task on /file.css, /another.css, and /path/to/file.css
taro.get('*.css') // runs task on /file.css, and /another.css but *not* /path/to/file.css
taro.get('file.css') // runs task only on /file.css
```

Aliased as `Server#for` and `Server#task`.

#### Server#alias(ext, alias)

Aliases requests for `ext` to all associated aliases. For example, if `scss` is aliased to `css`, then requesting `styles.css` will look for `styles.css` *and* `styles.scss`.

By default we alias SASS, SCSS, LESS, and CoffeeScript extensions. Use this if you'd like to add your own custom aliases.

```javascript
taro
	.alias('css', 'newext')
	.get('styles.css') // will look for styles.css and styles.newext
```

#### Server#middleware()

Return Express-ready middleware.

```javascript
app.use(taro.middleware());
// or, namespace some the URLs
app.use('/assets', taro.middleware());
```

#### Task#source(glob)

Uses a set of source files for a given task. Use this if your source file to destination file is not a 1:1 relationship. This just calls `gulp.src` under the hood.

```javascript
// concatenates all the js files in `js/libraries/` into a single file
taro
	.get('libraries.js')
	.source('js/libraries/**/*.js')
	.use(concat, 'libraries.js')
```

Aliased as `Task#src`

#### Task#use(plugin[, opts...])

Use `plugin` with `opts` when processing files. Do not call the plugins with `()`, simply pass them into use.

```javascript
taro
	.get('**/*.css')
	.use(sass) // Note how we don't call the function `()`. This is important.
	.use(prefix, opts) // You can pass plugin options through subsequent arguments
```

#### Task#when(condition, plugin[, opts...])

Use `plugin` with `opts` if `condition` evaluates to true. This is particularly useful for applying plugins to specific environments.

```javascript
taro
	.get('**/*.js')
	.use(6to5)
		.when('production' === process.env.NODE_ENV, uglify)
```

This will always use the `6to5` gulp plugin, but will only run `uglify` on production environments.

## Errors

Taro passes errors onto your Express application. So if a request 404s, it will be handled by your application's code.

Asset compilation errors get passed on as a 500 error.

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