import { Observer } from '../src/Observer';
import type { CallSummary, CallSummaryConfig } from '../src/summaries/CallSummary';
import type { ClientSample } from '../src/schema/ClientSample';

/**
 * `CallSummary` — the record of what happened in a call, finalised when it closes.
 *
 * Everything else in this library is about *now*, and throws its state away with the call. These
 * tests pin the three things that make a summary trustworthy rather than merely present: it is
 * opt-in section by section, its caps announce what they dropped, and it is delivered while the call
 * is still reachable.
 */

const sample = (clientId: string, callId = 'call-1'): ClientSample => ({
	callId,
	clientId,
	timestamp: 1000,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
} as unknown as ClientSample);

function newObserver(callSummary?: Partial<CallSummaryConfig> | null) {
	const observer = new Observer({ autoUpdateOnCallUpdate: false, closeCallIfEmptyForMs: undefined, callSummary });
	const summaries: CallSummary[] = [];

	observer.on('call-summary', ({ summary }) => summaries.push(summary));

	return { observer, summaries };
}

describe('CallSummary: opt-in', () => {
	it('is undefined unless configured', () => {
		const { observer, summaries } = newObserver();
		const call = observer.createObservedCall({ callId: 'call-1' })!;

		observer.accept(sample('alice'));

		expect(call.summary).toBeUndefined();

		call.close();

		expect(summaries).toHaveLength(0);

		observer.close();
	});

	// The misreading this type is built to prevent: `summary.issues === undefined` must mean "not
	// collected", and there must be no empty section tempting you to read it as "none happened".
	it('creates only the sections that were asked for', () => {
		const { observer } = newObserver({ include: [ 'clients' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(call.summary?.clients).toBeDefined();
		expect(call.summary?.issues).toBeUndefined();
		expect(call.summary?.turnServers).toBeUndefined();
		expect(call.summary?.scores).toBeUndefined();

		observer.close();
	});

	// The point of configuring this at construction: every call carries the same sections, so two
	// summaries from the same observer are always comparable. There is no window in which some calls
	// were summarised and others were not.
	it('applies the same shape to every call, whenever it was created', () => {
		const { observer } = newObserver({ include: [ 'clients' ] });
		const first = observer.createObservedCall({ callId: 'first' })!;

		observer.accept(sample('alice', 'first'));

		const later = observer.createObservedCall({ callId: 'later' })!;

		expect(Object.keys(first.summary ?? {})).toEqual(Object.keys(later.summary ?? {}));
		expect(first.summary?.clients).toBeDefined();
		expect(later.summary?.clients).toBeDefined();

		observer.close();
	});

	// Without this guard `enableSummary()` would hand back a summary object with no collector behind
	// it — sections present, permanently empty, and indistinguishable from a quiet call.
	it('refuses to create a summary nothing would fill', () => {
		const { observer } = newObserver();
		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(call.enableSummary()).toBeUndefined();
		expect(call.summary).toBeUndefined();

		observer.close();
	});

	it('does not restart a summary that already exists', () => {
		const { observer } = newObserver({ include: [ 'clients' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		observer.accept(sample('alice'));

		const first = call.summary;

		call.enableSummary();

		expect(call.summary).toBe(first);
		expect(call.summary?.clients?.joined).toBe(1);

		observer.close();
	});
});

describe('CallSummary: built-in sections', () => {
	it('records the client roster over the call\'s life, not just who is left', () => {
		const { observer, summaries } = newObserver({ include: [ 'clients' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		observer.accept(sample('alice'));
		observer.accept(sample('bob'));
		observer.accept(sample('carol'));

		call.getObservedClient('alice')!.close();
		call.close();

		expect(summaries).toHaveLength(1);

		const clients = summaries[0].clients!;

		// Alice left, but the record of the call still contains her.
		expect(clients.clientIds).toEqual([ 'alice', 'bob', 'carol' ]);
		expect(clients.joined).toBe(3);
		expect(clients.left).toBe(3);
		expect(clients.peak).toBe(3);

		observer.close();
	});

	it('logs call issues and tallies them by type', () => {
		const { observer, summaries } = newObserver({ include: [ 'issues' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		call.addIssue({ type: 'A', timestamp: 1 });
		call.addIssue({ type: 'A', timestamp: 2 });
		call.addIssue({ type: 'B', timestamp: 3, payload: { x: 1 } });
		call.close();

		const issues = summaries[0].issues!;

		expect(issues).toHaveLength(3);
		expect(issues.map((issue) => issue.type)).toEqual([ 'A', 'A', 'B' ]);
		expect(issues[2].scope).toBe('call');
		expect(issues[2].payload).toEqual({ x: 1 });

		observer.close();
	});

	it('summarises the score with percentiles, computed once at close', () => {
		const { observer, summaries } = newObserver({ include: [ 'scores' ] });

		const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;
		const queued = [ 4, 2, 5 ];

		// The real calculator recomputes from the clients on every update and would overwrite anything
		// assigned directly, so the score has to come from a calculator rather than from the field.
		call.scoreCalculator = { update: () => (call.calculatedScore.value = queued.shift() ?? 5) };

		for (let i = 0; i < 3; i++) call.update();
		call.close();

		const scores = summaries[0].scores!;

		// `close()` updates once more before finalising, so a fourth reading is sampled.
		expect(scores.samples).toBe(4);
		expect(scores.min).toBe(2);
		expect(scores.max).toBe(5);
		expect(scores.median).toBeDefined();

		observer.close();
	});

	it('reports zero samples rather than a fake score when nothing was measured', () => {
		const { observer, summaries } = newObserver({ include: [ 'scores' ] });
		observer.createObservedCall({ callId: 'call-1' })!.close();

		expect(summaries[0].scores).toEqual({ samples: 0 });

		observer.close();
	});
});

describe('CallSummary: caps', () => {
	// A silently truncated summary is worse than none: someone will read `issues.length` as the issue
	// count. It is only safe to drop issues because the shortfall is stated, which keeps the true
	// count recoverable as `issues.length + truncated.issues`.
	it('caps the issue list and says how much it dropped', () => {
		const { observer, summaries } = newObserver({ include: [ 'issues' ], maxIssues: 2 });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		for (let i = 0; i < 5; i++) call.addIssue({ type: 'A', timestamp: i });
		call.close();

		expect(summaries[0].issues).toHaveLength(2);
		expect(summaries[0].truncated).toEqual({ issues: 3 });
		expect(summaries[0].issues!.length + summaries[0].truncated!.issues!).toBe(5);

		observer.close();
	});

	it('caps client ids the same way', () => {
		const { observer, summaries } = newObserver({ include: [ 'clients' ], maxClientIds: 2 });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		for (const clientId of [ 'a', 'b', 'c', 'd' ]) observer.accept(sample(clientId));
		call.close();

		expect(summaries[0].clients!.clientIds).toEqual([ 'a', 'b' ]);
		expect(summaries[0].clients!.joined).toBe(4);
		expect(summaries[0].truncated).toEqual({ clientIds: 2 });

		observer.close();
	});

	it('omits `truncated` entirely when nothing was dropped', () => {
		const { observer, summaries } = newObserver({ include: [ 'issues' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		call.addIssue({ type: 'A', timestamp: 1 });
		call.close();

		expect(summaries[0].truncated).toBeUndefined();

		observer.close();
	});
});

describe('CallSummary: enrichment', () => {
	it('folds any call-scoped event into attachments', () => {
		const { observer, summaries } = newObserver({
			include: [],
			enrich: {
				'client-added': (summary, { observedClient }) => {
					const seen = (summary.attachments.seen ??= []) as string[];

					seen.push(observedClient.clientId);
				},
				'call-issue': (summary, { issue }) => {
					summary.attachments.lastIssue = issue.type;
				},
			},
		});

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		observer.accept(sample('alice'));
		observer.accept(sample('bob'));
		call.addIssue({ type: 'SOMETHING', timestamp: 1 });
		call.close();

		expect(summaries[0].attachments).toEqual({ seen: [ 'alice', 'bob' ], lastIssue: 'SOMETHING' });
		// No sections were requested, so none exist — enrichment alone is a valid summary.
		expect(summaries[0].clients).toBeUndefined();

		observer.close();
	});

	// A summary is a side-channel. Nothing about a call should break because a field could not be
	// recorded — least of all the application's own code.
	it('survives an enricher that throws', () => {
		const { observer, summaries } = newObserver({
			include: [ 'clients' ],
			enrich: {
				'client-added': () => { throw new Error('boom'); },
			},
		});

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(() => observer.accept(sample('alice'))).not.toThrow();

		call.close();

		expect(summaries[0].clients!.joined).toBe(1);

		observer.close();
	});

	it('routes each event to its own call only', () => {
		const { observer, summaries } = newObserver({
			include: [],
			enrich: {
				'client-added': (summary, { observedClient }) => {
					((summary.attachments.seen ??= []) as string[]).push(observedClient.clientId);
				},
			},
		});

		const first = observer.createObservedCall({ callId: 'call-1' })!;
		const second = observer.createObservedCall({ callId: 'call-2' })!;

		observer.accept(sample('alice', 'call-1'));
		observer.accept(sample('bob', 'call-2'));

		first.close();
		second.close();

		expect(summaries[0].attachments.seen).toEqual([ 'alice' ]);
		expect(summaries[1].attachments.seen).toEqual([ 'bob' ]);

		observer.close();
	});
});

describe('CallSummary: lifecycle', () => {
	it('is delivered while the call is still reachable', () => {
		const { observer } = newObserver({ include: [ 'clients' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;
		let reachable = false;

		observer.on('call-summary', ({ observedCall }) => {
			reachable = observer.observedCalls.get(observedCall.callId) === observedCall;
		});

		call.close();

		expect(reachable).toBe(true);

		observer.close();
	});

	it('stamps the timings at close', () => {
		const { observer, summaries } = newObserver({ include: [] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		call.startedAt = 1000;
		call.endedAt = 4000;
		call.close();

		expect(summaries[0].callId).toBe('call-1');
		expect(summaries[0].durationInMs).toBe(3000);
		expect(summaries[0].closedAt).toBeDefined();

		observer.close();
	});

	// Closing the observer closes its calls; every summary must still make it out, which means the
	// collector's subscriptions have to outlive the calls.
	it('still emits when the observer closes the calls', () => {
		const { observer, summaries } = newObserver({ include: [ 'clients' ] });
		observer.createObservedCall({ callId: 'call-1' });
		observer.createObservedCall({ callId: 'call-2' });
		observer.close();

		expect(summaries).toHaveLength(2);
	});

	// The reason the collector is one object with one subscription per event type, rather than one
	// per call: a per-call design is quadratic in the number of concurrent calls.
	it('adds no listeners per call', () => {
		const { observer } = newObserver({ include: [ 'clients', 'issues' ] });

		const before = observer.eventNames().reduce((sum, name) => sum + observer.listenerCount(name as never), 0);

		for (let i = 0; i < 20; i++) observer.createObservedCall({ callId: `call-${i}` });

		const after = observer.eventNames().reduce((sum, name) => sum + observer.listenerCount(name as never), 0);

		expect(after).toBe(before);

		observer.close();
	});

	// `null` is the documented way to say "no summaries", so it must behave exactly like omitting the
	// field — not like `{}`, which is a summary with no sections but every subscription in place.
	it('treats a null config as off, like omitting it', () => {
		const { observer } = newObserver(null);

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(call.summary).toBeUndefined();
		// The collector's absence *is* "summaries are off" — there is no second flag to disagree.
		expect(observer.callSummaryCollector).toBeUndefined();

		observer.close();
	});
});
