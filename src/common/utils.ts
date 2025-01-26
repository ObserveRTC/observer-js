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

export function getMedian(arr: number[]): number {
	// Sort the array in ascending order
	const sortedArr = arr.slice().sort((a, b) => a - b);

	// Calculate the middle index
	const mid = Math.floor(sortedArr.length / 2);

	// If the array length is odd, return the middle element
	if (sortedArr.length % 2 !== 0) {
		return sortedArr[mid];
	}

	// If the array length is even, return the average of the two middle elements
	return (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

export function parseJsonAs<T>(json?: string): T | undefined {
	if (!json) {
		return undefined;
	}
	
	try {
		return JSON.parse(json) as T;
	} catch (error) {
		return undefined;
	}
}