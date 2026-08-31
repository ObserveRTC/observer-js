import { Observer } from '../src/Observer';
import { ClientMetaTypes } from '../src/schema/ClientMetaTypes';
import type { ClientIssue, ClientMetaData } from '../src/schema/ClientSample';
import { legacyPayload, makeSample } from './helpers/samples';

/**
 * Three generations of the same payload have now travelled on the wire, and the observer accepts all
 * three at once — a fleet is never on one client version:
 *
 * - **pre-3.5.0** — the payload is a JSON string the reader has to parse;
 * - **3.5.0 / 3.6.0** — a record whose values are primitives;
 * - **3.7.0** — a record whose values are free-form JSON, so it may nest objects and arrays.
 *
 * Every reader goes through `parseJsonAs` / `parseJsonObject` and narrows with a `typeof` guard, so
 * the three are indistinguishable downstream. These specs pin that down: the same assertion holds
 * for each generation, and nesting survives to the consumer intact.
 */

const PC = 'pc-1';

/** A payload as a pre-3.5.0 client put it on the wire. */
const asLegacy = (payload: Record<string, unknown>) => legacyPayload(payload);

/** A payload as a 3.5.0/3.6.0 client put it on the wire: a flat map of primitives. */
const asFlat = (payload: Record<string, boolean | string | number>): SamplePayload => payload;

/**
 * The cases are typed rather than cast at the call site on purpose: the nested literals below are
 * assignable to `payload` only because 3.7.0 widened its values to free-form JSON, so this file
 * stops compiling if the schema ever narrows back.
 */
type SamplePayload = ClientIssue['payload'];
type PayloadCase = [ string, SamplePayload ];

const clientOf = (observer: Observer) => observer.getObservedCall('call-1')?.getObservedClient('client-1');

const sampleWithEvent = (payload: SamplePayload, timestamp: number) => makeSample({
	timestamp,
	peerConnections: [ { peerConnectionId: PC } ],
	clientEvents: [ { type: 'ICE_CONNECTION_STATE_CHANGED', timestamp, payload } ],
});

const sampleWithIssue = (issue: ClientIssue, timestamp: number) => ({
	...makeSample({ timestamp, peerConnections: [ { peerConnectionId: PC } ] }),
	clientIssues: [ issue ],
});

const sampleWithMetaData = (metaData: ClientMetaData, timestamp: number) => ({
	...makeSample({ timestamp }),
	clientMetaItems: [ metaData ],
});

describe('payload wire generations', () => {
	describe('client events', () => {
		it.each<PayloadCase>([
			[ 'pre-3.5.0 JSON string', asLegacy({ peerConnectionId: PC, iceConnectionState: 'connected' }) ],
			[ '3.5.0 flat record', asFlat({ peerConnectionId: PC, iceConnectionState: 'connected' }) ],
			[ '3.7.0 nested record', { peerConnectionId: PC, iceConnectionState: 'connected', context: { transport: { relayed: true }, tried: [ 'host', 'srflx' ] } } ],
		])('reads a %s payload', (_name, payload) => {
			const observer = new Observer();
			const states: string[] = [];

			observer.on('ice-connection-state-changed', ({ state }) => states.push(state));
			observer.accept(sampleWithEvent(payload, 1000));

			expect(states).toEqual([ 'connected' ]);
			expect(clientOf(observer)?.observedPeerConnections.get(PC)?.iceConnectionState).toBe('connected');

			observer.close();
		});
	});

	describe('client issues', () => {
		it.each<PayloadCase>([
			[ 'pre-3.5.0 JSON string', asLegacy({ peerConnectionId: PC, trackId: 't-1' }) ],
			[ '3.5.0 flat record', asFlat({ peerConnectionId: PC, trackId: 't-1' }) ],
			[ '3.7.0 nested record', { peerConnectionId: PC, trackId: 't-1', evidence: { window: { lostRatio: 0.4 } } } ],
		])('lifts the joins out of a %s payload', (_name, payload) => {
			const observer = new Observer();

			observer.accept(sampleWithIssue({ type: 'freezed-video-track', key: 'k-1', payload, timestamp: 1000 }, 1000));

			const active = clientOf(observer)?.activeIssues.get('k-1');

			expect(active?.peerConnectionId).toBe(PC);
			expect(active?.trackId).toBe('t-1');

			observer.close();
		});

		it('delivers a nested 3.7.0 payload to the consumer intact', () => {
			const observer = new Observer();
			const evidence = { window: { lostRatio: 0.4, samples: [ 1, 2, 3 ] } };

			observer.accept(sampleWithIssue({ type: 'freezed-video-track', key: 'k-1', payload: { peerConnectionId: PC, evidence }, timestamp: 1000 }, 1000));

			expect(clientOf(observer)?.activeIssues.get('k-1')?.payload?.evidence).toEqual(evidence);

			observer.close();
		});
	});

	describe('client meta data', () => {
		it.each<PayloadCase>([
			[ 'pre-3.5.0 JSON string', asLegacy({ name: 'Chrome', version: '148' }) ],
			[ '3.5.0 flat record', asFlat({ name: 'Chrome', version: '148' }) ],
			[ '3.7.0 nested record', { name: 'Chrome', version: '148', brands: [ { brand: 'Chromium', version: '148' } ] } ],
		])('parses a %s payload', (_name, payload) => {
			const observer = new Observer();

			observer.accept(sampleWithMetaData({ type: ClientMetaTypes.BROWSER, payload }, 1000));

			expect(clientOf(observer)?.browser?.name).toBe('Chrome');
			expect(clientOf(observer)?.browser?.version).toBe('148');

			observer.close();
		});
	});
});
