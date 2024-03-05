export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Writable<T> = T extends object ? { -readonly [K in keyof T]: Writable<T[K]> } : T;

export function iteratorConverter<T>(generator: Generator<T, void, undefined>): IterableIterator<T> {
	return {
		[Symbol.iterator](): IterableIterator<T> {
			return this;
		},
		next(): IteratorResult<T> {
			return generator.next();
		},
	};
}

export function asyncIteratorConverter<T>(generator: AsyncGenerator<T, void, undefined>): AsyncIterableIterator<T> {
	return {
		[Symbol.asyncIterator](): AsyncIterableIterator<T> {
			return this;
		},
		next(): Promise<IteratorResult<T>> {
			return generator.next();
		},
	};
}

export function isValidUuid(str: string): boolean {
	const regexp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

	return regexp.test(str);
}