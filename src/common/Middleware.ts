export type Middleware<T> = (
	input: T,
	next: (nextInput: T) => void,
) => void;

export interface Processor<T> {
	process(value: T): void;
	addMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
	removeMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
}

export function createProcessor<T>(
): Processor<T> {
	const stack: Middleware<T>[] = [];
	const result: Processor<T> = {
		addMiddleware: (...middlewares: Middleware<T>[]) => {
			if (middlewares && 0 < middlewares.length) {
				stack.push(...middlewares);
			}
			
			return result;
		},

		removeMiddleware: (...middlewares: Middleware<T>[]) => {
			if (middlewares && 0 < middlewares.length) {
				for (const process of middlewares) {
					const index = stack.indexOf(process);

					if (0 < index) stack.splice(index, 1);
				}
			}
			
			return result;
		},
		process: (value: T) => {
			let prevIndex = -1;
			const execute = (index: number, input: T): void => {
				if (index <= prevIndex) {
					throw new Error('middleware must call next() only once!');
				}
				prevIndex = index;
				const middleware = stack[index];

				if (!middleware) return;

				const next = (nextInput: T) => execute(index + 1, nextInput);
							
				return middleware(input, next);
			};
					
			return execute(0, value);
		},
	};

	return result;
}