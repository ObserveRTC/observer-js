const path = require('path');
const webpack = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const libraryConfig = require('./library.config/index.json')
const {version} = require('./package.json')

const libraryName = `${libraryConfig.libraryName}`
const buildDetails = (name = '') => {
    switch (name) {
        case 'callstats':
            return {entry: './build/jitsi.js', filename: 'observer.min.js'}
    }
    return {entry: './build/default.js', filename: `${name}.js`}
}


module.exports = {
    entry: {
        'observer-lib': buildDetails(libraryName).entry
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: buildDetails(libraryName).filename,
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
