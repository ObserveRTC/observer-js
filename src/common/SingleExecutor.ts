export type SingleExecutor = ReturnType<typeof createSingleExecutor>;

export function createSingleExecutor() {
	let semaphore = 1;
	const tasks: (() => Promise<unknown>)[] = [];

	const execute = <T = unknown>(task: () => Promise<T>) => {
		return new Promise<T>((resolve, reject) => {
			tasks.push(() => task().then(resolve)
				.catch(reject));
			run();
		});
	};

	const run = () => {
		if (semaphore < 1) return;

		const task = tasks.shift();

		if (!task) return;

		const postProcess = () => {
			++semaphore;
			run();
		};

		--semaphore;

		task()
			.then(postProcess)
			.catch(postProcess);
	
	};

	return execute;
}