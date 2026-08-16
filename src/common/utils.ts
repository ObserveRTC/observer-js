export type DeferredPromise<T> = {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
};

export function createDeferredPromise<T>(): DeferredPromise<T> {
	let resolve: (value: T | PromiseLike<T>) => void;
	let reject: (reason?: any) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve: resolve!, reject: reject! };
}

/** Collect finite numbers only; `undefined`/`NaN`/`Infinity` must not enter a percentile summary. */
export function pushFinite(target: number[], value: number | undefined): void {
	if (typeof value === 'number' && Number.isFinite(value)) target.push(value);
}

/**
 * Best-effort JSON parse. Returns `undefined` for empty input or malformed JSON rather than throwing
 * — every caller here is reading data that arrived over the wire, where a parse failure is data to
 * ignore rather than an exception to propagate.
 *
 * The single JSON entry point; {@link parseJsonObject} adds the "and it must be an object"
 * guarantee on top, which is what every wire-payload reader actually wants.
 */
export function parseJsonAs<T>(json?: string): T | undefined {
	if (!json) return undefined;

	try {
		return JSON.parse(json) as T;
	} catch {
		return undefined;
	}
}

/** `parseJsonAs`, narrowed to "an object came back" — the shape every payload reader wants. */
export function parseJsonObject(json?: string): Record<string, unknown> | undefined {
	const parsed = parseJsonAs<unknown>(json);

	return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined;
}
