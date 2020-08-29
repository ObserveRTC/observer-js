const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const libraryConfig = require('./library.config/index.json')
const {version} = require('./package.json')

const libraryName = `${libraryConfig.libraryName}`
const exportCallStats = `${libraryConfig.exportCallstats}`

module.exports = {
    entry: {
        'webextrapp-lib': exportCallStats === 'true' ?
            './build/callstats.js' : './build/default.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        library: libraryName,
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
            LIBRARY_VERSION: JSON.stringify(version),
            DEBUG: JSON.stringify(libraryConfig.debug),
            POOLING_INTERVAL_MS: JSON.stringify(libraryConfig.poolingIntervalMs),
            WS_SERVER_URL: JSON.stringify(libraryConfig.wsServer.URL),
            WS_SERVER_UUID: JSON.stringify(libraryConfig.wsServer.UUID)
        }),
        new CleanWebpackPlugin({
            dry: true,
            verbose: true
        })
    ],
};
