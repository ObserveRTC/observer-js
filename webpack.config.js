const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const {version, libraryName, exportCallstats} = require('./package.json')

const library = process.env.LIBRARY_NAME ? `${process.env.LIBRARY_NAME}` : `${libraryName}`
const exportCallStats = process.env.CALLSTATS ? `${process.env.CALLSTATS}` : `${exportCallstats}`

module.exports = {
    entry: {
        'webextrapp-lib': exportCallStats === 'true' ? './build/callstats.js' : './build/default.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        library: library,
        umdNamedDefine: true,
        libraryExport: "default",
        libraryTarget: "umd"
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: [/node_modules/],
                loader: 'ts-loader',
            },
        ],
    },
    optimization: {
        minimizer: [
            new UglifyJsPlugin({
                include: /\.min\.js$/,
                sourceMap: true,
            }),
        ]
    },
    plugins: [
        new webpack.ProgressPlugin(),
        new webpack.DefinePlugin({
            VERSION: version
        }),
        new CleanWebpackPlugin({
            dry: true,
            verbose: true
        })
    ],

};
