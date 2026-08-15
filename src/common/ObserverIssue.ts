import { parseJsonObject } from './utils';

/**
 * A finding raised **by the observer** — `observedCall.addIssue()` / `observer.addIssue()`, surfaced
 * on the bus as `call-issue` / `observer-issue`.
 *
 * ### Why this is not `ClientIssue`
 *
 * `ClientIssue` is a **wire** type: it arrives inside a `ClientSample`, so its `payload` has to be a
 * string. Server-raised findings were reusing it, which forced every detector to `JSON.stringify` a
 * perfectly good object on the way out and every handler to `JSON.parse` it back on the way in —
 * paying serialisation on a path where nothing is ever serialised, and losing type information in
 * both directions.
 *
 * An observer issue goes straight to an in-process event handler, so it carries the object.
 */
export type ObserverIssue = {

	/** What was found, e.g. `'CROSS_CALL_ISSUE_ONSET_BURST'`. */
	type: string;

	/** Observer clock, when the finding was raised. */
	timestamp: number;

	/**
	 * The evidence behind the finding.
	 *
	 * Prefer an object — that is the point of this type. `string` is still accepted so an application
	 * can forward a payload it already has serialised (e.g. relaying a `ClientIssue`) without a
	 * pointless parse-then-restringify round trip. Use {@link issuePayloadOf} to read either form.
	 */
	payload?: string | Record<string, unknown>;
};

/**
 * The payload of an issue as an object, parsing it only if it happens to be a string.
 *
 * Handlers shouldn't have to care which form arrived. Returns `undefined` for a missing payload or a
 * string that isn't valid JSON — reading evidence must never throw inside an issue handler.
 */
export function issuePayloadOf(issue: Pick<ObserverIssue, 'payload'>): Record<string, unknown> | undefined {
	const payload = issue.payload;

	if (payload === undefined) return undefined;

	return typeof payload === 'string' ? parseJsonObject(payload) : payload;
}

/**
 * The payload as a JSON string, serialising it only if it is an object.
 *
 * For the boundaries that genuinely need text — a log line, an HTTP body, a message queue. Keep it at
 * the edge rather than in the detector, so in-process handlers never pay for it.
 */
export function issuePayloadAsString(issue: Pick<ObserverIssue, 'payload'>): string | undefined {
	const payload = issue.payload;

	if (payload === undefined) return undefined;
	if (typeof payload === 'string') return payload;

	try {
		return JSON.stringify(payload);
	} catch {
		// Circular reference or a non-serialisable value; the caller wanted text, not an exception.
		return undefined;
	}
}
