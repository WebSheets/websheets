var gulp = require('gulp');
var gulpConcat = require('gulp-concat');
var gulpFooter = require('gulp-footer');
var gulpHeader = require('gulp-header');
var gulpUglify = require('gulp-uglify');

gulp.task('build', function() {
    gulp.src(['src/base.js', 'src/*/*.js'])
        .pipe(gulpConcat('src/websheet.min.js'))
        .pipe(gulpHeader('(function(window, document) {'))
        .pipe(gulpFooter('window.define ? window.define(\'websheet\', function() {return WebSheet;}) : window.WebSheet = WebSheet;}(window, document));'))
        .pipe(gulpUglify())
        .pipe(gulp.dest('build'));
});

gulp.task('default', ['build']);
