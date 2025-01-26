export type Middleware<T> = (
	input: T,
	next: (nextInput: T) => void
) => void;

export interface Processor<T> {
	finalCallback?: Callback<T>;
	process(value: T): void;
	addMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
	removeMiddleware(...middlewares: Middleware<T>[]): Processor<T>;
}

type Callback<T> = (input: T) => void;

class Executor<T> {
	public done = false;
	private index = 0;
	private prevIndex = -1;

	constructor(
		private readonly stack: Middleware<T>[], 
		private readonly finalCallback?: Callback<T>
	) {
	}

	// Executes the middleware stack
	public execute(input: T): void {
		if (this.index <= this.prevIndex) {
			throw new Error('Middleware must call next() only once!');
		} else if (this.done) {
			throw new Error('Middleware stack has already been executed!');
		}

		this.prevIndex = this.index;

		const middleware = this.stack[this.index];

		this.index++;

		if (middleware) {
			return middleware(input, (nextInput: T) => this.execute(nextInput));
		}

		this.done = true;
		this.finalCallback?.(input);
	}
}

export class MiddlewareProcessor<T> implements Processor<T> {
	private stack: Middleware<T>[] = [];
	public finalCallback?: Callback<T>;

	public addMiddleware(...middlewares: Middleware<T>[]): Processor<T> {
		if (middlewares && middlewares.length > 0) {
			this.stack.push(...middlewares);
		}
		
		return this;
	}

	public removeMiddleware(...middlewares: Middleware<T>[]): Processor<T> {
		if (middlewares && middlewares.length > 0) {
			for (const middleware of middlewares) {
				const index = this.stack.indexOf(middleware);

				if (index >= 0) {
					this.stack.splice(index, 1);
				}
			}
		}

		return this;
	}

	public process(value: T): void {
		if (this.stack.length === 0) {
			return this.finalCallback?.(value);
		}

		const executor = new Executor(this.stack, this.finalCallback);

		executor.execute(value);
	}
}
