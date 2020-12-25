const path = require('path')
const jsonPlugin = require('@rollup/plugin-json')
const nodeResolvePlugin = require('@rollup/plugin-node-resolve').nodeResolve
const typescriptPlugin = require('@rollup/plugin-typescript')
const terserPlugin = require('rollup-plugin-terser').terser
const dtsPlugin = require('rollup-plugin-dts').default
const licensePlugin = require('rollup-plugin-license')
const { version } = require('./package.json')
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace';
import virtual from '@rollup/plugin-virtual';
import {plugin as globImport} from 'rollup-plugin-glob-import';

const outputDirectory = 'dist'
const commonBanner = licensePlugin({
  banner: {
    content: {
      file: path.join(__dirname, 'LICENSE.md'),
    },
  },
})
let sourceCode = 'wtf'
const buildDate = JSON.stringify(new Date().toUTCString())
const buildVersion = JSON.stringify(version)
const isProd = process.env.npm_lifecycle_event === 'build'
const myPlugin = ({
  name: 'copy-worker',
  renderChunk(code) {
    return code.replace(/___code___/, `${code}`)
  }
})

const getSource = () => {
  console.warn(arguments)
  return 'wwww'
}

const commonInput = {
  input: './src/observer.api/package/index.ts',
  plugins: [
    nodeResolvePlugin({
      browser: true,
    }),
    jsonPlugin(),
    typescriptPlugin({
      declaration: false,
    }),
    commonjs(),
    commonBanner,
    replace({
      __buildDate__: buildDate,
      __buildVersion__: buildVersion,
    }),
  ],
}

const commonOutput = {
  name: 'ObserverRTC',
  exports: 'named',
}

const commonTerser = terserPlugin(require('./terser.config.js'))

const buildDev =  {
  ...commonOutput,
  file: `${outputDirectory}/observer.js`,
  format: 'umd',
}

const buildProduction = {
  ...commonOutput,
  file: `${outputDirectory}/observer.min.js`,
  format: 'umd',
  plugins: [commonTerser],
}

module.exports = [
  // Browser bundles. They have all the dependencies included for convenience.
  {
    ...commonInput,
    output: [
      isProd ? buildProduction : buildDev
    ],
  },

  // TypeScript definition
  {
    ...commonInput,
    plugins: [dtsPlugin(), commonBanner],
    output: {
      file: `${outputDirectory}/observer.d.ts`,
      format: 'es',
    },
  },
]
