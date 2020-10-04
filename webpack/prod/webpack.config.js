const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const libraryConfig = require('../../project.config/core')
const {version} = require('../../package.json')

module.exports = {
    entry: {
        'observer-lib': './build/default.js'
    },
    output: {
        path: path.resolve(__dirname, '../../', 'dist', 'core'),
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
        minimize: true
    },
    plugins: [
        new webpack.ProgressPlugin(),
        new webpack.DefinePlugin({
            LIBRARY_VERSION: JSON.stringify(version),
            DEBUG: JSON.stringify(libraryConfig.debug),
        }),
        new CleanWebpackPlugin({
            dry: true,
            verbose: true
        })
    ],
};
