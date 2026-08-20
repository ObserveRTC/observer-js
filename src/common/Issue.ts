import type { IssueConclusion } from '../detectors/IssueConclusion';

/**
 * What every server-raised finding carries, whatever raised it.
 *
 * ### Why this is not `ClientIssue`
 *
 * `ClientIssue` is a **wire** type: it arrives inside a `ClientSample`, so its `payload` is bound to
 * what the schema can carry — a record of primitives since schema 3.5.0, a JSON string on samples
 * from earlier clients. Server-raised findings were reusing it, which forced every detector to `JSON.stringify` a
 * perfectly good object on the way out and every handler to `JSON.parse` it back on the way in —
 * paying serialisation on a path where nothing is ever serialised, and losing type information in
 * both directions. These go straight to an in-process handler, so they carry the object.
 */
export type IssueBase = {

	/** What was found, e.g. `'CROSS_CALL_ISSUE_ONSET_BURST'`. */
	type: string;

	/** Observer clock, when the finding was raised. */
	timestamp: number;

	/**
	 * What the finding *means* — where to look, and how much the evidence justifies it.
	 *
	 * A first-class field rather than a key inside {@link payload}, because it is the one part every
	 * finding has in common and the one part an alerting rule reads. Burying it in the evidence made
	 * `payload.conclusion.faultDomain` the path to the most important thing in the object.
	 */
	conclusion?: IssueConclusion;

	/**
	 * The evidence, and **only** the evidence.
	 *
	 * Deliberately does not repeat `type`, `scope`, or the ids already present on the event that
	 * delivers it. A payload that restates its envelope invites the two to disagree — and they did,
	 * because nothing kept them in step.
	 */
	payload?: Record<string, unknown>;
};

/**
 * A finding about **one call**, raised by `observedCall.addIssue()` and delivered as `call-issue`.
 *
 * The call is the event's scope (`{ observedCall, observer }`), so the payload does not carry a
 * `callId` — read it from the event.
 */
export type CallIssue = IssueBase & {
	scope: 'call';
};

/**
 * A finding about the **fleet**, raised by `observer.addIssue()` and delivered as `observer-issue`.
 *
 * Raised by detectors and validators that reason across calls, so no single call owns it. Where the
 * finding does concern specific calls — a cross-call correlation, say — they are named in the
 * evidence, because that *is* the evidence.
 */
export type ObserverIssue = IssueBase & {
	scope: 'observer';
};

/**
 * Either kind, discriminated by {@link IssueBase} + `scope`.
 *
 * `scope` is on the issue and not merely implied by which event fired, so a finding stays
 * self-describing once it leaves the bus — funnelled into one handler, a log line, or a queue.
 */
export type Issue = CallIssue | ObserverIssue;

/**
 * The payload as a JSON string, for the boundaries that genuinely need text — a log line, an HTTP
 * body, a message queue.
 *
 * Returns `undefined` for a missing payload, or for one that cannot be serialised (a circular
 * reference from something an application attached): the caller wanted text, not an exception.
 */
export function issuePayloadAsString(issue: Pick<IssueBase, 'payload'>): string | undefined {
	if (issue.payload === undefined) return undefined;

	try {
		return JSON.stringify(issue.payload);
	} catch {
		return undefined;
	}
}
