import * as Logger from 'loglevel'

// @ts-ignore
const debug = DEBUG === true ? true : false
function initLogger(name: string, prefix: any) {
    const result = Logger.getLogger(name)
    if (debug) {
        result.enableAll()
    } else {
        result.setLevel(4)
    }

    if (!prefix) return result
    // @ts-ignore
    result.prefix = prefix
    const original = {
        debug: result.debug.bind(result),
        error: result.error.bind(result),
        info: result.info.bind(result),
        trace: result.trace.bind(result),
        warn: result.warn.bind(result),
    }
    result.trace = (...args) => original.trace((typeof prefix === 'function' ? prefix() : prefix), ...args)
    result.debug = (...args) => original.debug((typeof prefix === 'function' ? prefix() : prefix), ...args)
    result.info = (...args) => original.info((typeof prefix === 'function' ? prefix() : prefix), ...args)
    result.warn = (...args) => original.warn((typeof prefix === 'function' ? prefix() : prefix), ...args)
    result.error = (...args) => original.error((typeof prefix === 'function' ? prefix() : prefix), ...args)
    return result
}
const logger = initLogger('webextrapp', () => `${new Date().toISOString()}`)
export default logger
