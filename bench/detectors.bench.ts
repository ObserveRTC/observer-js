/**
 * Hot-path benchmark for the detector pipeline, at realistic SFU shape.
 *
 * Every client publishes **its own** camera producer and subscribes to `SUBSCRIPTIONS` others, which
 * is what a grid meeting actually looks like — a call of N participants carries N published tracks
 * and up to N*(N-1) subscriptions, and the aggregation work scales with the subscriptions, not the
 * participants.
 *
 *   CALLS=20 CLIENTS=12 SUBSCRIPTIONS=11 yarn bench
 */
import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import type { ClientSample } from '../src/schema/ClientSample';

const CALLS = Number(process.env.CALLS ?? 20);
const CLIENTS = Number(process.env.CLIENTS ?? 12);
const SUBSCRIPTIONS = Number(process.env.SUBSCRIPTIONS ?? CLIENTS - 1);
const TICKS = Number(process.env.TICKS ?? 40);
/** Share of clients holding an open issue. Issues drive every registry query, so this is the axis. */
const ISSUE_SHARE = Number(process.env.ISSUE_SHARE ?? 0.3);

type Peer = { callId: string, clientId: string, index: number, subscribesTo: string[] };

function sample(peer: Peer, timestamp: number, withIssue: boolean): ClientSample {
	const inboundRtps: unknown[] = [];
	const inboundTracks: unknown[] = [];

	for (let i = 0; i < peer.subscribesTo.length; i++) {
		const producerId = peer.subscribesTo[i];
		const trackId = `${peer.clientId}-in-${i}`;

		inboundRtps.push({
			timestamp, id: `rtp-${trackId}`, ssrc: 1000 + i, kind: 'video', trackIdentifier: trackId,
			bytesReceived: timestamp * 90, packetsReceived: timestamp / 10, packetsLost: 0,
			jitter: 0.01, framesReceived: timestamp / 30, jitterBufferDelay: 1, jitterBufferEmittedCount: 100,
		});
		inboundTracks.push({
			timestamp, id: trackId, kind: 'video',
			attachments: { producerId, consumerId: `${peer.clientId}-c-${i}` },
		});
	}

	return {
		callId: peer.callId,
		clientId: peer.clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc-${peer.clientId}`,
			inboundRtps,
			inboundTracks,
			mediaSources: [ { timestamp, id: `ms-${peer.clientId}`, kind: 'video', trackIdentifier: `${peer.clientId}-out` } ],
			outboundRtps: [ {
				timestamp, id: `out-${peer.clientId}`, ssrc: 1, kind: 'video', mediaSourceId: `ms-${peer.clientId}`,
				bytesSent: timestamp * 200, packetsSent: timestamp / 10,
			} ],
			outboundTracks: [ {
				timestamp, id: `${peer.clientId}-out`, kind: 'video',
				attachments: { producerId: `${peer.clientId}-cam` },
			} ],
		} ],
		clientIssues: withIssue
			? [ {
				type: 'congestion',
				key: `${peer.clientId}:congestion`,
				payload: JSON.stringify({ trackId: `${peer.clientId}-in-0` }),
				timestamp,
			} ]
			: undefined,
	} as unknown as ClientSample;
}

function buildPeers(): Peer[] {
	const peers: Peer[] = [];

	for (let c = 0; c < CALLS; c++) {
		const callId = `call-${c}`;

		for (let i = 0; i < CLIENTS; i++) {
			const subscribesTo: string[] = [];

			for (let s = 1; s <= SUBSCRIPTIONS; s++) {
				subscribesTo.push(`call-${c}-c${(i + s) % CLIENTS}-cam`);
			}
			peers.push({ callId, clientId: `call-${c}-c${i}`, index: i, subscribesTo });
		}
	}

	return peers;
}

function measure(label: string, callDetectors: Record<string, unknown> | null) {
	const observer = new Observer({
		// Manual update control: auto-updating per accept() (the default) would blur the "accept" and
		// "update" timings measured separately below into one another.
		autoUpdateOnCallUpdate: false,
		observerDetectors: null as never,
		callDetectors: callDetectors as never,
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
	});
	const peers = buildPeers();
	const issueCount = Math.round(CLIENTS * ISSUE_SHARE);
	const callIds = Array.from({ length: CALLS }, (_, i) => `call-${i}`);

	// Pre-create every call with client-driven auto-update disabled too, so `accept()` (which would
	// otherwise create it with the default `autoUpdateOnClientUpdate: true`) reuses these.
	for (const callId of callIds) observer.createObservedCall({ callId, autoUpdateOnClientUpdate: false });

	for (const peer of peers) observer.accept(sample(peer, 1000, false));

	let acceptMs = 0;
	let updateMs = 0;

	for (let tick = 2; tick <= TICKS + 1; tick++) {
		const timestamp = tick * 1000;
		let t = process.hrtime.bigint();

		for (const peer of peers) observer.accept(sample(peer, timestamp, peer.index < issueCount));
		acceptMs += Number(process.hrtime.bigint() - t) / 1e6;

		t = process.hrtime.bigint();
		for (const callId of callIds) observer.getObservedCall(callId)?.update();
		observer.update();
		updateMs += Number(process.hrtime.bigint() - t) / 1e6;
	}

	observer.close();

	return {
		label,
		acceptMsPerTick: Number((acceptMs / TICKS).toFixed(2)),
		updateMsPerTick: Number((updateMs / TICKS).toFixed(2)),
	};
}

// The four call-scope detectors (see `AvailableCallScopeDetectorsConfigs` / `CALL_SCOPE_DETECTOR_NAMES`
// in `src/Observer.ts`). `ice-disruption-detector` is observer-scope only now, so it isn't one of
// these any more; the RTCP check is a validator, not a detector, so it was never one either.
const ALL = [
	'concurrent-issue-detector', 'issue-fan-out-detector', 'track-delivery-mismatch-detector',
	'unconsumed-track-detector',
] as const;

const only = (name: string) => {
	const config: Record<string, unknown> = {};

	for (const other of ALL) if (other !== name) config[other] = null;

	return config;
};

measure('warmup', {}); // let the JIT settle before the first reported number

const rows = [
	measure('no detectors (ingest only)', Object.fromEntries(ALL.map((n) => [ n, null ]))),
	...ALL.map((name) => measure(`only ${name}`, only(name))),
	measure('ALL detectors', {}),
];

console.log(`\ncalls=${CALLS} clients/call=${CLIENTS} subscriptions/client=${SUBSCRIPTIONS} ticks=${TICKS} issueShare=${ISSUE_SHARE}`);
console.log(`published tracks/call=${CLIENTS}  receiver links/call=${CLIENTS * SUBSCRIPTIONS}\n`);
console.log('scenario'.padEnd(38), 'accept ms/tick', ' update ms/tick');
for (const row of rows) {
	console.log(row.label.padEnd(38), String(row.acceptMsPerTick).padStart(13), String(row.updateMsPerTick).padStart(14));
}
