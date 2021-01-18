const path = require('path')
const jsonPlugin = require('@rollup/plugin-json')
const nodeResolvePlugin = require('@rollup/plugin-node-resolve').nodeResolve
const typescriptPlugin = require('@rollup/plugin-typescript')
const terserPlugin = require('rollup-plugin-terser').terser
const dtsPlugin = require('rollup-plugin-dts').default
const licensePlugin = require('rollup-plugin-license')
const { version, config } = require('./package.json')
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
const getWorkerURL = (isProduction = false) => {
  const workerURL = isProduction ? `${config.workerLoadEndpoint}/${version}/observer.worker.min.js` : `${config.workerLoadEndpoint}/${version}/observer.worker.js`
  return workerURL
}


const outputDirectory = `dist/v${version}`
const outputDirectoryLatest = `dist/latest`
const buildDate = JSON.stringify(new Date().toUTCString())
const buildVersion = JSON.stringify(version)
const isProd = process.env.npm_lifecycle_event === 'build'
const workerURL = JSON.stringify(getWorkerURL(isProd))
const commonTerser = terserPlugin(require('./terser.config.js'))

const collectorRootFilePath = './src/observer.collector/__package__/index.ts'
const workerRootFilePath = './src/observer.processor/__package__/index.ts'

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
    getLicense(),
    replace({
      __buildDate__: buildDate,
      __buildVersion__: buildVersion,
      __workerUrl__: workerURL,
      __isDebug__: JSON.stringify(isProd === false),
    }),
  ],
}

const collectorLibraryOutput = {
  name: 'ObserverRTC',
  exports: 'named',
}

const workerLibraryOutput = {
  name: 'ObserverWorkerRTC',
  exports: 'named',
}

const buildLibrary = (isProduction = false, outputLatest = false, isWorker = false) => {
  const libraryFileName = isProduction ? (isWorker ? 'observer.worker.min' : 'observer.min') : (isWorker ? 'observer.worker' : 'observer')
  const libraryFileNameDefinition = 'observer.d'
  const currentOutputDirectory = outputLatest === true ? outputDirectoryLatest : outputDirectory
  const rootFilePath = isWorker ? workerRootFilePath : collectorRootFilePath

  const buildCollectorLibrary = {
    ...(isWorker ? workerLibraryOutput : collectorLibraryOutput),
    file: `${currentOutputDirectory}/${libraryFileName}.js`,
    format: 'umd',
    ...(isProduction && { plugins: [commonTerser] }),
  }

  const buildConfig = []
  buildConfig.push(
    // Library building
    {
      ...commonInput,
      input: rootFilePath,
      output: [
        buildCollectorLibrary,
      ],
    },
  )
  if (!isWorker) {
    // TypeScript definition
    buildConfig.push({
      ...commonInput,
      input: rootFilePath,
      plugins: [dtsPlugin(), getLicense()],
      output: {
        file: `${outputDirectory}/${libraryFileNameDefinition}.ts`,
        format: 'es',
      },
    })
  }
  return buildConfig
}

module.exports = [
  ...buildLibrary(isProd, false, false),
  ...buildLibrary(isProd, false, true),
]
