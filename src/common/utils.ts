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
 * Payloads arrive in two shapes. Schema 3.5.0 and later deliver them as records, ready to use;
 * samples from clients on earlier schema versions carry the same payload as a JSON string. An object
 * passes through untouched, a string is parsed — so every reader handles both wire generations
 * without knowing which one it is looking at.
 *
 * Since schema 3.7.0 a record's values are free-form JSON rather than primitives, so a payload may
 * nest objects and arrays to any depth. That widening costs the readers here nothing — they already
 * treat every value as `unknown` and narrow with a `typeof` guard before use — but it is the reason
 * a value must never be read bare: `payload.role` is `unknown`, not `string`.
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

/**
 * Best-effort read of a wire `scoreReasons` field. Schema 3.6.0 carries it as a record of
 * reason key → the points that reason subtracted from the score; samples from clients on
 * earlier schema versions (3.5.x) carried the reason *keys only*, as a `string[]`. A legacy
 * array is folded into the record shape with a magnitude of `0` — the key still conveys the
 * reason, and `0` keeps any downstream summing of contributions honest about the magnitude
 * the old wire never carried. Record entries whose value is not a finite number are dropped.
 * An empty result collapses to `undefined`, matching the client's "omitted when there is
 * nothing to explain"; anything unreadable is data to ignore rather than an exception to
 * propagate.
 */
export function normalizeScoreReasons(value?: unknown): Record<string, number> | undefined {
	if (value === undefined || value === null) return undefined;

	const result: Record<string, number> = {};

	if (Array.isArray(value)) {
		for (const entry of value) {
			if (typeof entry !== 'string' || entry.length === 0) continue;

			result[entry] = 0;
		}
	} else if (typeof value === 'object') {
		for (const [ key, magnitude ] of Object.entries(value as Record<string, unknown>)) {
			if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) continue;

			result[key] = magnitude;
		}
	} else {
		return undefined;
	}

	return Object.keys(result).length === 0 ? undefined : result;
}

function isPublicIpv4Address(address: string): boolean {
	const parts = address.split('.');

	if (parts.length !== 4) return false;

	const octets: number[] = [];

	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return false;

		const octet = Number(part);

		if (255 < octet) return false;
		octets.push(octet);
	}

	const [ a, b, c ] = octets;

	if (a === 0) return false; // "this" network (incl. 0.0.0.0, the browsers' redacted address)
	if (a === 10) return false; // RFC 1918
	if (a === 100 && 64 <= b && b <= 127) return false; // RFC 6598 carrier-grade NAT
	if (a === 127) return false; // loopback
	if (a === 169 && b === 254) return false; // link-local
	if (a === 172 && 16 <= b && b <= 31) return false; // RFC 1918
	if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
	if (a === 192 && b === 168) return false; // RFC 1918
	if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
	if (224 <= a) return false; // multicast + reserved + broadcast

	return true;
}

function isPublicIpv6Address(address: string): boolean {
	const lower = address.toLowerCase().replace(/^\[|\]$/g, '')
		.split('%')[0];

	if (!lower.includes(':')) return false;

	const mappedV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);

	if (mappedV4) return isPublicIpv4Address(mappedV4[1]);
	if (lower === '::' || lower === '::1') return false; // unspecified / loopback
	if (/^fe[89ab]/.test(lower)) return false; // fe80::/10 link-local
	if (/^f[cd]/.test(lower)) return false; // fc00::/7 unique local
	if (lower.startsWith('ff')) return false; // multicast
	if (lower.startsWith('2001:db8')) return false; // documentation

	return true;
}

/**
 * `true` when `address` is an IP literal that is reachable on the public internet — i.e. not
 * private (RFC 1918 / ULA), loopback, link-local, carrier-grade NAT, multicast, unspecified, an mDNS
 * `.local` hostname (how browsers obfuscate host candidates) or empty.
 */
export function isPublicIpAddress(address?: string | null): boolean {
	if (!address) return false;

	const trimmed = address.trim();

	if (!trimmed || trimmed.endsWith('.local')) return false;
	if (trimmed.includes(':')) return isPublicIpv6Address(trimmed);

	return isPublicIpv4Address(trimmed);
}
