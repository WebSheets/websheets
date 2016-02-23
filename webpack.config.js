var path = require('path');

var ExtractTextPlugin = require('extract-text-webpack-plugin');
var webpack = require('webpack');


module.exports = {
    // devtool: 'source-maps',
    entry: {
        app: ['./src/index.js']
    },
    output: {
        path: path.resolve(__dirname, 'dist', 'src'),
        publicPath: '/',
        filename: '/websheet.min.js',
        library: 'WebSheet',
    },
    plugins: [
        new ExtractTextPlugin('style.css'),
        new webpack.optimize.UglifyJsPlugin({
            compress: {warnings: false},
            mangle: {},
            sourceMap: false,
        }),
        new webpack.optimize.DedupePlugin(),
    ],
    module: {
        loaders: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
            }, {
                test: /\.css$/,
                loader: 'style-loader!css-loader',
            },
        ],
    },
};
