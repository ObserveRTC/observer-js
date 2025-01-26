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

export interface ObserverLogger {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	trace(module: string, ...args: any[]): void;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	debug(module: string, ...args: any[]): void;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	info(module: string, ...args: any[]): void;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	warn(module: string, ...args: any[]): void;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	error(module: string, ...args: any[]): void;
}

let mainLogger: ObserverLogger = new class implements ObserverLogger {
	trace = () => void 0;
	// trace(module: string, ...args: any[]) {
	// 	// eslint-disable-next-line no-console
	// 	console.log(`[TRACE] ${module}`, ...args);
	// }

	debug(module: string, ...args: any[]) {
		// eslint-disable-next-line no-console
		console.log(`[DEBUG] ${module}`, ...args);
	}

	info(module: string, ...args: any[]) {
		// eslint-disable-next-line no-console
		console.info(`[INFO] ${module}`, ...args);
	}

	warn(module: string, ...args: any[]) {
		// eslint-disable-next-line no-console
		console.warn(`[WARN] ${module}`, ...args);
	}

	error(module: string, ...args: any[]) {
		// eslint-disable-next-line no-console
		console.error(`[ERROR] ${module}`, ...args);
	}
}();

export function createLogger(moduleName: string): Logger {
	return new class implements Logger {
		trace(...args: any[]) {
			mainLogger.trace(moduleName, ...args);
		}

		debug(...args: any[]) {
			mainLogger.debug(moduleName, ...args);
		}

		info(...args: any[]) {
			mainLogger.info(moduleName, ...args);
		}

		warn(...args: any[]) {
			mainLogger.warn(moduleName, ...args);
		}

		error(...args: any[]) {
			mainLogger.error(moduleName, ...args);
		}

	}();
}

export function setObserverLogger(logger: ObserverLogger) {
	mainLogger = logger;
}
