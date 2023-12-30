/**
 * Interface for a Semaphore, a synchronization primitive that provides exclusive access to a shared resource.
 * Semaphores are used to ensure that only one process can access the shared resource at a time.
 */
export interface Semaphore {

	/**
	 * Acquires the semaphore, blocking until the semaphore is available.
	 * When the semaphore is acquired, it prevents other processes from acquiring it.
	 * @returns A Promise that resolves when the semaphore is successfully acquired.
	 */
	acquire(): Promise<void>;

	/**
	 * Releases the semaphore, allowing other processes to acquire it.
	 * @returns A Promise that resolves when the semaphore is successfully released.
	 */
	release(): Promise<void>;
}

export function createDummySemaphore(): Semaphore {
	return {
		acquire: () => Promise.resolve(),
		release: () => Promise.resolve(),
	};
}

/**
 * Interface for a SemaphoreProvider, an object that provides semaphore instances for different shared resources.
 * SemaphoreProviders are used to manage access to shared resources across multiple processes.
 */
export interface SemaphoreProvider {

	/**
	 * A Semaphore instance that manages access to the 'call' shared resource.
	 * This semaphore ensures that only one process can access the 'call' resource at a time.
	 */
	readonly callSemaphore: Semaphore;
}

export function createSimpleSemaphoreProvider(): SemaphoreProvider {
	return {
		callSemaphore: createDummySemaphore(),
	};
}
