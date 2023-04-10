export type Middleware<T> = (input: T, next?: Middleware<T>) => Promise<void>;

export function createMiddlewareFromAsyncProcess<T>(process: (input: T) => Promise<void>) {
	const middleware: Middleware<T> = async (input, next) => {
		await process(input);
		if (next) await next(input);
	};
	return middleware;
}
