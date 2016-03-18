var path = require('path');

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
            },
        ],
    },
};
