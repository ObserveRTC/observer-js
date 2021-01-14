const path = require('path')
const jsonPlugin = require('@rollup/plugin-json')
const nodeResolvePlugin = require('@rollup/plugin-node-resolve').nodeResolve
const typescriptPlugin = require('@rollup/plugin-typescript')
const terserPlugin = require('rollup-plugin-terser').terser
const licensePlugin = require('rollup-plugin-license')
const { version } = require('./package.json')
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace';

const outputDirectory = `dist/v${version}`
const outputDirectoryLatest = `dist/latest`
const commonBanner = licensePlugin({
  banner: {
    content: {
      file: path.join(__dirname, 'LICENSE.md'),
    },
  },
})
const buildDate = JSON.stringify(new Date().toUTCString())
const buildVersion = JSON.stringify(version)
const isProd = process.env.npm_lifecycle_event === 'build'

const commonInput = {
  input: './src/observer.processor/__package__/index.ts',
  plugins: [
    nodeResolvePlugin({
      browser: true,
    }),
    jsonPlugin(),
    typescriptPlugin({
      declaration: false,
    }),
    commonjs(),
    // todo (pallab) uncomment before publishing
    // commonBanner,
    replace({
      __buildDate__: buildDate,
      __buildVersion__: buildVersion,
      __isDebug__: JSON.stringify(isProd === false)
    })
  ],
}

const commonOutput = {
  name: 'ObserverRTC',
  exports: 'named',
}

const commonTerser = terserPlugin(require('./terser.config.js'))

const buildDev =  {
  ...commonOutput,
  file: `${outputDirectory}/observer.worker.js`,
  format: 'umd',
}

const buildDevLatest =  {
  ...buildDev,
  file: `${outputDirectoryLatest}/observer.worker.js`,
}

const buildProduction = {
  ...commonOutput,
  file: `${outputDirectory}/observer.worker.min.js`,
  format: 'umd',
  plugins: [commonTerser],
}

const buildProductionLatest = {
  ...buildProduction,
  file: `${outputDirectoryLatest}/observer.worker.min.js`,
}

module.exports = [
  // Browser bundles. They have all the dependencies included for convenience.
  {
    ...commonInput,
    output: [
      isProd ? buildProduction : buildDev,
      isProd ? buildProductionLatest : buildDevLatest
    ],
  }
]
