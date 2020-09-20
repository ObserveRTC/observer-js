const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const libraryConfig = require('./library.config/index.json')
const {version} = require('./package.json')

const libraryName = `${libraryConfig.libraryName}`

module.exports = {
    entry: {
        'observer-lib': libraryName === 'callstats' ?
            './build/jitsi.js' : './build/default.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        filename: libraryName === 'callstats' ? 'observer.min.js': '[name].js',
        library: libraryName,
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
            POOLING_INTERVAL_MS: JSON.stringify(libraryConfig.poolingIntervalMs),
            WS_SERVER_URL: JSON.stringify(libraryConfig.wsServer.URL),
            SERVICE_UUID: JSON.stringify(libraryConfig.wsServer.ServiceUUID),
            MEDIA_UNIT_ID: JSON.stringify(libraryConfig.wsServer.MediaUnitID),
            STATS_VERSION: JSON.stringify(libraryConfig.wsServer.StatsVersion)
        }),
        new CleanWebpackPlugin({
            dry: true,
            verbose: true
        })
    ],
};
