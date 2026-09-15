/**
 * What each internal module holds, obtained via {@link createLogger}.
 *
 * Every level method is variadic and `console`-style: a printf-like format string
 * (`%s`, `%d`, `%o`, `%j`) followed by its substitution values, and sometimes a
 * trailing object. Calls are forwarded to the process-wide {@link ObserverLogger}
 * with the module name prepended as the first argument.
 */
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

/**
 * The single process-wide sink every {@link Logger} forwards to, installed with
 * {@link setObserverLogger}.
 *
 * **Argument order:** the originating module name is a separate *leading* argument —
 * it is never part of the message. What follows is the `console`-style format string
 * and its substitution values:
 *
 * ```ts
 * observerLogger.warn('ObservedPeerConnection', 'Received sample without callId. %o', sample);
 * //                   ^ module                  ^ format string            ^ values
 * ```
 *
 * **Pitfall:** do not spread those arguments into a logger whose first parameter is the
 * message (pino, bunyan, roarr). `log.warn(module, ...args)` makes the module name the
 * entire message, and the real format string and its values are then consumed as
 * interpolation values for a string with no placeholders — i.e. silently dropped. Pass
 * the module as structured metadata (`log.warn({ module }, ...args)`) or collapse the
 * arguments yourself with `util.format`. `console` is fine either way.
 *
 * See `docs/logging.md` for pino / winston / console recipes.
 */
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

/**
 * Create a {@link Logger} bound to `moduleName`. Every call forwards to the process-wide
 * {@link ObserverLogger}, passing `moduleName` as the first argument. Exported so host
 * applications can route their own modules through the same sink.
 */
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

/**
 * Replace the process-wide log sink. Global and last-wins: one call reroutes all logging
 * from every `Observer` instance in the process. The sink is read on every log call, so
 * this can be called at any time, before or after constructing an `Observer`.
 *
 * Mind the argument order of {@link ObserverLogger} — the module name comes first.
 */
export function setObserverLogger(logger: ObserverLogger) {
	mainLogger = logger;
}
