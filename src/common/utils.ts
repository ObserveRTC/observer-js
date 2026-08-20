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
 * Best-effort read of a wire payload. Returns `undefined` for empty input or malformed JSON rather
 * than throwing — every caller here is reading data that arrived over the wire, where a bad value is
 * data to ignore rather than an exception to propagate.
 *
 * Payloads arrive in two shapes. Schema 3.5.0 delivers them as records, ready to use; samples from
 * clients on earlier schema versions carry the same payload as a JSON string. An object passes
 * through untouched, a string is parsed — so every reader handles both wire generations without
 * knowing which one it is looking at.
 *
 * The single payload entry point; {@link parseJsonObject} adds the "and it must be an object"
 * guarantee on top, which is what every wire-payload reader actually wants.
 */
export function parseJsonAs<T>(value?: unknown): T | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object') return value as T;
	if (typeof value !== 'string') return undefined;

	try {
		return JSON.parse(value) as T;
	} catch {
		return undefined;
	}
}

/** `parseJsonAs`, narrowed to "an object came back" — the shape every payload reader wants. */
export function parseJsonObject(value?: unknown): Record<string, unknown> | undefined {
	const parsed = parseJsonAs<unknown>(value);

	return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
}
