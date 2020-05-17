import * as logger from 'loglevel'
import * as prefix from 'loglevel-plugin-prefix'

prefix.reg(logger)
logger.enableAll()

prefix.apply(logger, {
    template: '[%t] %l (%n) static text:',
    levelFormatter(level: string) {
        return level.toUpperCase()
    },
    nameFormatter(name) {
        return name || 'global'
    },
    timestampFormatter(date) {
        return date.toISOString()
    },
})

export default logger
