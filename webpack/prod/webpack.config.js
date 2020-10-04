const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const {version} = require('../../package.json')
const {readFileSync} = require('fs')

module.exports = {
    entry: {
        'observer-lib': './build/default.js'
    },
    output: {
        path: path.resolve(__dirname, '../../', 'dist'),
        filename: "observer.min.js",
        library: "ObserverRTC",
        umdNamedDefine: true,
        libraryExport: "default",
        libraryTarget: "umd"
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
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
        minimize: true,
    },
    plugins: [
        new webpack.ProgressPlugin(),
        new webpack.DefinePlugin({
            LIBRARY_VERSION: JSON.stringify(version),
            DEBUG: JSON.stringify(false),
        }),
        new webpack.BannerPlugin({
            banner: readFileSync(path.resolve(__dirname, '../../', 'LICENSE.md'), 'utf8'),
            raw: false
        }),
        new CleanWebpackPlugin({
            dry: true,
            verbose: true
        })
    ],
};
