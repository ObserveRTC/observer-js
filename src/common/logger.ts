export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    trace(...args: any[]): void;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    debug(...args: any[]): void;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    info(...args: any[]): void;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    warn(...args: any[]): void;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    error(...args: any[]): void;
}

export interface WrappedLogger extends Logger {
    init(): void;
    level: LogLevel | undefined,
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
const created = Date.now();

function createDefaultLoggerFactory(): LoggerFactory {
    return () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const trace = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.trace(...args);
        };
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const debug = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.debug(...args);
        };
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const info = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.info(...args);
        };
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const warn = (...args: any[]) => {
            /* eslint-disable no-debugger, no-console */
            console.warn(...args);
        };
        /* eslint-disable @typescript-eslint/no-explicit-any */
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

const wrapLogger = (logger: Logger, moduleName: string, logLevel?: LogLevel) => {

    let isTrace = false;
    let isDebug = false
    let isInfo = false
    let isWarning = false;
    let isError = false;

    let _level = logLevel;
    let _logger = logger;
	const tracePrefix = `${COLORS.magenta}[TRACE]${COLORS.default} ${moduleName}`;
	const debugPrefix = `${COLORS.cyan}[DEBUG]${COLORS.default} ${moduleName}`;
	const infoPrefix = `${COLORS.green}[INFO]${COLORS.default} ${moduleName}`;
	const warnPrefix = `${COLORS.yellow}[WARN]${COLORS.default} ${moduleName}`;
	const errorPrefix = `${COLORS.red}[ERROR]${COLORS.default} ${moduleName}`;

    const result = new class implements WrappedLogger {
        public init() {
            isTrace = ["trace"].includes(_level ?? defaultLevel);
            isDebug = ["trace", "debug"].includes(_level ?? defaultLevel);
            isInfo = ["trace", "debug", "info"].includes(_level ?? defaultLevel);
            isWarning = ["trace", "debug", "info", "warn"].includes(_level ?? defaultLevel);
            isError = ["trace", "debug", "info", "warn", "error"].includes(_level ?? defaultLevel);
        }
		public get logger() {
			return _logger;
		}
		public set logger(value: Logger) {
			_logger = value;
		}
        public get level(): LogLevel | undefined {
            return _level;
        }
        public set level(value: LogLevel | undefined) {
            _level = value;
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        trace(...args: any[]): void {
            if (isTrace) {
				const elapsedInMs = `${COLORS.magenta}+${Date.now() - created}ms${COLORS.default}`
                logger.trace(tracePrefix, ...args, elapsedInMs);
            }
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        debug(...args: any[]): void {
            if (isDebug) {
				const elapsedInMs = `${COLORS.magenta}+${Date.now() - created}ms${COLORS.default}`
                logger.debug(debugPrefix, ...args, elapsedInMs);
            }
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        info(...args: any[]): void {
            if (isInfo) {
				const elapsedInMs = `${COLORS.magenta}+${Date.now() - created}ms${COLORS.default}`
                logger.info(infoPrefix, ...args, elapsedInMs);
            }
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        warn(...args: any[]): void {
            if (isWarning) {
				const elapsedInMs = `${COLORS.magenta}+${Date.now() - created}ms${COLORS.default}`
                logger.warn(warnPrefix, ...args, elapsedInMs);
            }
        }
        /* eslint-disable @typescript-eslint/no-explicit-any */
        error(...args: any[]): void {
            if (isError) {
				const elapsedInMs = `${COLORS.magenta}+${Date.now() - created}ms${COLORS.default}`
                logger.error(errorPrefix, ...args, elapsedInMs);
            }
            
        }
    }
    return result;
}


let actualLoggerFactory: LoggerFactory = createDefaultLoggerFactory();
const loggers = new Map<string, WrappedLogger>();

export const createLogger = (moduleName: string, logLevel?: LogLevel) => {
	let wrappedLogger = loggers.get(moduleName);
	if (!wrappedLogger) {
        const logger = actualLoggerFactory();
		wrappedLogger = wrapLogger(logger, moduleName, logLevel ?? defaultLevel);
		loggers.set(moduleName, wrappedLogger);
	} else {
		wrappedLogger.level = logLevel ?? defaultLevel;
    }
    wrappedLogger.init();
    return wrappedLogger;
}

export const setLogLevel = (level: LogLevel) => {
    defaultLevel = level;
    for (const [moduleName] of Array.from(loggers.entries())) {
        loggers.set(moduleName, createLogger(moduleName, level));
    }
};

export const setLoggerFactory = (loggerFactory: LoggerFactory) => {
    actualLoggerFactory = loggerFactory;
    for (const [moduleName, logger] of Array.from(loggers.entries())) {
        loggers.set(moduleName, createLogger(moduleName, logger.level));
    }
};

export const getLogLevel = () => {
    return defaultLevel;
}

