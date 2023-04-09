export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
};

export interface WrappedLogger extends Logger {
    init(): void;
    level: LogLevel,
	logger: Logger;
}

export type LoggerFactory = () => Logger;

const COLORS = {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    default: "\x1b[39m",
};

let defaultLevel: LogLevel = "error";

function createDefaultLoggerFactory(): LoggerFactory {
    return () => {
        const trace = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.trace(...args);
        };
        const debug = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.debug(...args);
        };
        const info = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.info(...args);
        };
        const warn = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.warn(...args);
        };
        const error = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.error(...args);
        };
        return {
            trace,
            debug,
            info,
            warn,
            error,
        }
    }
}

const wrapLogger = (logger: Logger, logLevel: LogLevel) => {

    let isTrace = false;
    let isDebug = false
    let isInfo = false
    let isWarning = false;
    let isError = false;

    let _level = logLevel;
    let _logger = logger;
    
    const result = new class implements WrappedLogger {
        public init() {
            isTrace = ["trace"].includes(_level);
            isDebug = ["trace", "debug"].includes(_level);
            isInfo = ["trace", "debug", "info"].includes(_level);
            isWarning = ["trace", "debug", "info", "warn"].includes(_level);
            isError = ["trace", "debug", "info", "warn", "error"].includes(_level);
        }
		public get logger() {
			return _logger;
		}
		public set logger(value: Logger) {
			_logger = value;
		}
        public get level() {
            return _level;
        }
        public set level(value: LogLevel) {
            _level = value;
        }
        trace(...args: any[]): void {
            const tracePrefix = `${COLORS.magenta}[TRACE]${COLORS.default} ${(new Date()).toISOString()}`;
            if (isTrace) {
                logger.trace(tracePrefix, ...args);
            }
        }
        debug(...args: any[]): void {
            const debugPrefix = `${COLORS.cyan}[DEBUG]${COLORS.default} ${(new Date()).toISOString()}`;
            if (isDebug) {
                logger.debug(debugPrefix, ...args);
            }
        }
        info(...args: any[]): void {
            const infoPrefix = `${COLORS.green}[INFO]${COLORS.default} ${(new Date()).toISOString()}`;
            if (isInfo) {
                logger.info(infoPrefix, ...args);
            }
        }
        warn(...args: any[]): void {
            const warnPrefix = `${COLORS.yellow}[WARN]${COLORS.default} ${(new Date()).toISOString()}`;
            if (isWarning) {
                logger.warn(warnPrefix, ...args);
            }
        }
        error(...args: any[]): void {
            const errorPrefix = `${COLORS.red}[ERROR]${COLORS.default} ${(new Date()).toISOString()}`;
            if (isError) {
                logger.error(errorPrefix, ...args);
            }
            
        }
    }
    return result;
}


let actualLoggerFactory: LoggerFactory = createDefaultLoggerFactory();
const loggers = new Map<string, WrappedLogger>();

export const createLogger = (moduleName: string, logLevel?: LogLevel): Logger => {
	let wrappedLogger = loggers.get(moduleName);
	if (!wrappedLogger) {
        const logger = actualLoggerFactory();
		wrappedLogger = wrapLogger(logger, logLevel ?? defaultLevel);
		loggers.set(moduleName, wrappedLogger);
	} else {
		wrappedLogger.level = logLevel ?? defaultLevel;
    }
    wrappedLogger.init();
    return wrappedLogger;
}

export const setLogLevel = (level: LogLevel) => {
    defaultLevel = level;
    for (const wrappedLogger of Array.from(loggers.values())) {
        wrappedLogger.level = level;
        wrappedLogger.init();
    }
};

export const setLoggerFactory = (loggerFactory: LoggerFactory) => {
    actualLoggerFactory = loggerFactory;
    for (const wrappedLogger of Array.from(loggers.values())) {
        wrappedLogger.logger = loggerFactory();
        wrappedLogger.init();
    }
};

export const getLogLevel = () => {
    return defaultLevel;
}

