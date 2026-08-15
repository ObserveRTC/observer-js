import { issuePayloadOf } from '../../src/common/ObserverIssue';
import type { ObserverIssue } from '../../src/common/ObserverIssue';

/**
 * The payload of a raised finding, loosely typed for assertions.
 *
 * `ObserverIssue.payload` is `Record<string, unknown>`, so every value reads as `unknown` and
 * `payload.conclusion.faultDomain` won't type-check. Tests assert against known shapes, so this
 * narrows once here instead of casting at every call site.
 */
export function payloadOf(issue: ObserverIssue | { payload?: string | Record<string, unknown> }): Record<string, any> {
	const payload = issuePayloadOf(issue);

	if (payload === undefined) throw new Error('expected the issue to carry a payload');

	return payload;
}

/** Collector type for the issues a test gathers off the bus. */
export type CollectedIssue = { type: string, payload?: string | Record<string, unknown> };
