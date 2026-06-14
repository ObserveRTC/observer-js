import { Observer } from '../src/Observer';
import { InMemorySink } from '../src/sinks/InMemorySink';
import type { ClientSample } from '../src/schema/ClientSample';
import { makeSample } from './helpers/samples';

function setup() {
	let sink: InMemorySink | undefined;
	const observer = new Observer({
		createClientSink: () => (sink = new InMemorySink()),
	});

	// First accept creates the call + client (and the sink) and persists the first sample.
	observer.accept(makeSample({ clientId: 'client-1', timestamp: 1000 }));

	const client = observer.getObservedCall('call-1')!.getObservedClient('client-1')!;

	return { observer, client, getSink: () => sink!, last: () => sink!.samples[sink!.samples.length - 1] };
}

describe('ObservedClient injection lifecycle', () => {
	it('injecting between samples is merged into the next sample AND written to the sink', () => {
		const { observer, client, last } = setup();

		client.injectAttachment({ roomId: 'r1', displayName: 'Guest' });
		client.injectEvent({ type: 'CUSTOM_EVENT', timestamp: 2000 });
		client.injectIssue({ type: 'custom-issue', timestamp: 2000 });

		observer.accept(makeSample({ clientId: 'client-1', timestamp: 2000 }));

		const persisted = last();

		expect(persisted.timestamp).toBe(2000);
		// injectAttachment takes an object and merges all keys.
		expect(persisted.attachments?.roomId).toBe('r1');
		expect(persisted.attachments?.displayName).toBe('Guest');
		expect(persisted.clientEvents?.some((e) => e.type === 'CUSTOM_EVENT')).toBe(true);
		expect(persisted.clientIssues?.some((i) => i.type === 'custom-issue')).toBe(true);
		// And reflected in entity state.
		expect(client.attachments?.roomId).toBe('r1');
		expect(client.attachments?.displayName).toBe('Guest');
	});

	it('injecting DURING sample emission applies to the current sample (not deferred to the next)', () => {
		const { observer, client, last } = setup();

		// Inject from inside a client-updated handler — i.e. while the sample is being emitted.
		observer.on('client-updated', ({ observedClient }) => {
			observedClient.injectAttachment({ mark: 'now' });
			observedClient.injectEvent({ type: 'DURING_EMIT', timestamp: 3000 });
		});

		observer.accept(makeSample({ clientId: 'client-1', timestamp: 3000 }));

		const persisted = last();

		// The injection landed on THIS sample (timestamp 3000), both in the sink and in state.
		expect(persisted.timestamp).toBe(3000);
		expect(persisted.attachments?.mark).toBe('now');
		expect(persisted.clientEvents?.some((e) => e.type === 'DURING_EMIT')).toBe(true);
		expect(client.attachments?.mark).toBe('now');
	});

	it('injecting then closing with no further sample flushes the injection to the sink', () => {
		const { client, getSink, last } = setup();

		const sink = getSink();
		const before = sink.samples.length;

		client.injectAttachment({ finalRoom: 'r9' });
		client.injectEvent({ type: 'FINAL_EVENT', timestamp: 9000 });

		let closed = false;

		sink.on('close', () => { closed = true; });

		client.close();

		// A final synthetic sample carrying the injection was written, then the sink was ended.
		expect(sink.samples.length).toBe(before + 1);

		const persisted = last() as ClientSample;

		expect(persisted.attachments?.finalRoom).toBe('r9');
		expect(persisted.clientEvents?.some((e) => e.type === 'FINAL_EVENT')).toBe(true);
		expect(client.attachments?.finalRoom).toBe('r9');
		expect(closed).toBe(true);
	});

	it('closing with no pending injection does not write an extra sample', () => {
		const { client, getSink } = setup();

		const sink = getSink();
		const before = sink.samples.length;

		client.close();

		expect(sink.samples.length).toBe(before);
	});
});
