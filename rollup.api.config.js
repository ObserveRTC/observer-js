const path = require('path')
const jsonPlugin = require('@rollup/plugin-json')
const nodeResolvePlugin = require('@rollup/plugin-node-resolve').nodeResolve
const typescriptPlugin = require('@rollup/plugin-typescript')
const terserPlugin = require('rollup-plugin-terser').terser
const dtsPlugin = require('rollup-plugin-dts').default
const licensePlugin = require('rollup-plugin-license')
const workerLoader = require('rollup-plugin-web-worker-loader')
const { version } = require('./package.json')

const {
  collectorRootFilePath,
  collectorLibraryOutput,
  libraryFileNameDefinition,
  development,
  production,
} = require('./package.json').config


import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'


const getLicense = () => {
  const license = licensePlugin({
    banner: {
      content: {
        file: path.join(__dirname, 'LICENSE.md'),
      },
    },
  })
  return license
}

const buildDate = JSON.stringify(new Date().toUTCString())
const buildVersion = JSON.stringify(version)
const isProd = process.env.npm_lifecycle_event === 'build'
const commonTerser = terserPlugin(require('./terser.config.js'))

const getCommonInput = (currentVersion, libraryFileName) => {
  const commonInput = {
    plugins: [
      nodeResolvePlugin({
        browser: true,
      }),
      jsonPlugin(),
      typescriptPlugin({
        declaration: false,
      }),
      commonjs(),
      // getLicense(),
      replace({
        __buildDate__: buildDate,
        __buildVersion__: buildVersion,
        __libraryFileName__: JSON.stringify(libraryFileName),
        __isDebug__: JSON.stringify(isProd === false),
      }),
      workerLoader({
        targetPlatform: "browser",
        inline: true,
      }),
    ],
  }
  return commonInput
}

const buildLibrary = (isProduction = false, currentVersion = `v${version}`) => {
  const collectorlibraryFileName = isProduction ? production.collectorLibraryFileName : development.collectorLibraryFileName
  const libraryFileName = collectorlibraryFileName
  const currentOutputDirectory = `dist/${currentVersion}`
  const rootFilePath = collectorRootFilePath

  const buildCollectorLibrary = {
    ...collectorLibraryOutput,
    file: `${currentOutputDirectory}/${libraryFileName}`,
    format: 'umd',
    ...(isProduction && { plugins: [commonTerser] }),
  }

  const buildConfig = []
  buildConfig.push(
    // Library building
    {
      ...getCommonInput(currentVersion, collectorlibraryFileName),
      input: rootFilePath,
      output: [
        buildCollectorLibrary,
      ],
    },
  )
  // TypeScript definition
  buildConfig.push({
    ...getCommonInput(currentVersion,collectorlibraryFileName),
    input: rootFilePath,
    plugins: [dtsPlugin(), getLicense()],
    output: {
      file: `${currentOutputDirectory}/${libraryFileNameDefinition}`,
      format: 'es',
    },
  })
  return buildConfig
}

const buildPipe = [
    ...buildLibrary(isProd, `v${version}`, false),
]

module.exports = buildPipe
