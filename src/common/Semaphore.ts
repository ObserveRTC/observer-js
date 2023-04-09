
export interface Semaphore {
	acquire(): Promise<void>;
	release(): Promise<void>;
}

export function createDummySemaphore(): Semaphore {
	return {
		acquire: () => Promise.resolve(),
		release: () => Promise.resolve(),
	}
}

export interface SemaphoreProvider {
	readonly callSemaphore: Semaphore,
}

export function createSimpleSemaphoreProvider(): SemaphoreProvider {
	return {
		callSemaphore: createDummySemaphore(),
	}
}