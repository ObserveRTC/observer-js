import { createLogger } from '../common/logger';
import { Middleware } from './Middleware';

const logger = createLogger(`Middleware`);

export interface Processor<T> {
	use(value: T): Promise<void | T>;
	addMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
	removeMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
	getSize(): number;
}

export function createProcessor<T>(...processes: Middleware<T>[]): Processor<T> {
	const stack: Middleware<T>[] = [...processes];
	const result: Processor<T> = {
		addMiddleware: (...processes: Middleware<T>[]) => {
			if (processes && 0 < processes.length) {
				stack.push(...processes);
			}
			return result;
		},

		removeMiddleware: (...middlewares: Middleware<T>[]) => {
			if (middlewares && 0 < middlewares.length) {
				for (const middleware of middlewares) {
					const index = stack.indexOf(middleware);
					if (0 < index) stack.splice(index, 1);
				}
			}
			return result;
		},
		use: async (value: T): Promise<void> => {
			const executeMiddleware = async (input: T, index: number): Promise<void> => {
				if (index >= stack.length) {
					return;
				}

				const process = stack[index];
				const next = async (nextInput: T) => await executeMiddleware(nextInput, index + 1);
				return process(input, next).catch((err) => {
					logger.error(`Error occurred executing process ${process.name}`, err);
					return;
				});
			};

			return executeMiddleware(value, 0);
		},
		getSize: (): number => {
			return stack.length;
		}
	};

	return result;
}
