import * as Logger from 'loglevel'

// @ts-ignore
const initLogger = (prefix: string, dev? = true) => {
    const _logger = Logger.getLogger(prefix)
    _logger.methodFactory = (methodName: string, logLevel: Logger.LogLevelNumbers, loggerName: string) => {
        const originalFactory = Logger.methodFactory
        const rawMethod = originalFactory(methodName, logLevel, loggerName)
        // tslint:disable-next-line:only-arrow-functions
        return function () {
            return rawMethod(`${prefix} ${new Date().toUTCString()}`, ...arguments)
        }
    }
    if (dev) {
        _logger.enableAll()
    } else {
        _logger.setLevel(4)
    }
    return _logger
}

const logger = initLogger('ObserverRTC')
export { logger }
