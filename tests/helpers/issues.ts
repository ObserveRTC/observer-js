import type { Issue } from '../../src/common/Issue';

/**
 * The payload of a raised finding, loosely typed for assertions.
 *
 * `payload` is `Record<string, unknown>`, so every value reads as `unknown` and
 * `payload.affectedClients > 3` won't type-check. Tests assert against known shapes, so this narrows
 * once here instead of casting at every call site.
 *
 * Note `conclusion` is **not** in here — it is a first-class field on the issue (`issue.conclusion`),
 * not part of the evidence.
 */
export function payloadOf(issue: Pick<Issue, 'payload'>): Record<string, any> {
	if (issue.payload === undefined) throw new Error('expected the issue to carry a payload');

	return issue.payload as Record<string, any>;
}

/** Collector type for the issues a test gathers off the bus. */
export type CollectedIssue = Issue;
