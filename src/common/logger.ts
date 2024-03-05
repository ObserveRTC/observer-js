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

let logLevel: LogLevel = 'error';
const loggers = new Map<string, Logger>();
let target: Logger | null = {
	// eslint-disable-next-line no-console
	trace: (...args: any[]) => console.log(...args),
	// eslint-disable-next-line no-console
	debug: (...args: any[]) => console.log(...args),
	// eslint-disable-next-line no-console
	info: (...args: any[]) => console.log(...args),
	// eslint-disable-next-line no-console
	warn: (...args: any[]) => console.warn(...args),
	// eslint-disable-next-line no-console
	error: (...args: any[]) => console.error(...args),
};

export function setLogLevel(level: LogLevel) {
	logLevel = level;
	const moduleNames = Array.from(loggers.keys());

	loggers.clear();

	moduleNames.forEach((moduleName) => createLogger(moduleName));
}

export const getLogLevel = () => {
	return logLevel;
};

export function forwardLogsTo(logger: Logger | null) {
	target = logger;
}

const COLORS = {
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	default: '\x1b[39m',
};

export function createLogger(moduleName: string): Logger {
	if (loggers.has(moduleName)) {
		// eslint-disable-next-line no-console
		console.warn(`Logger for module ${moduleName} already exists`);
	}
	const trace = logLevel === 'trace' ? (message: string, ...args: any[]) => {
		target?.trace(`${COLORS.magenta}[TRACE]${COLORS.default} ${moduleName} ${message}`, ...args);
	} : () => void 0;
	const debug = logLevel === 'trace' || logLevel === 'debug' ? (message: string, ...args: any[]) => {
		target?.debug(`${COLORS.cyan}[DEBUG]${COLORS.default} ${moduleName} ${message}`, ...args);
	} : () => void 0;
	const info = logLevel === 'trace' || logLevel === 'debug' || logLevel === 'info' ? (message: string, ...args: any[]) => {
		target?.info(`${COLORS.green}[INFO]${COLORS.default} ${moduleName} ${message}`, ...args);
	} : () => void 0;
	const warn = logLevel === 'trace' || logLevel === 'debug' || logLevel === 'info' || logLevel === 'warn' ? (message: string, ...args: any[]) => {
		target?.warn(`${COLORS.yellow}[WARN]${COLORS.default} ${moduleName} ${message}`, ...args);
	} : () => void 0;
	const error = logLevel === 'trace' || logLevel === 'debug' || logLevel === 'info' || logLevel === 'warn' || logLevel === 'error' ? (message: string, ...args: any[]) => {
		target?.error(`${COLORS.red}[ERROR]${COLORS.default} ${moduleName} ${message}`, ...args);
	} : () => void 0;
	const logger = {
		trace,
		debug,
		info,
		warn,
		error,
	};

	loggers.set(moduleName, logger);
	
	return logger;
}
