/**
 * Per-client and per-call summaries.
 *
 * Shows how to turn what an `ObservedClient` accumulated over its session into a record you can
 * save, and how to fold those records into the call's `CallSummary` with an enricher:
 *
 *   ObservedClient session totals ──client-closed──▶ enricher ──▶ summary.attachments
 *                                                                       │
 *   ObservedCall.close() ──▶ call-summary ◀────────────────────────────┘
 *
 * Run it with:  yarn example:summaries
 *
 * Nothing here needs a helper object next to the client: every value is read off `ObservedClient`
 * at the moment it closes (`rttSummary`, `scoreSummary`, `issueHistogram`, the `total*` counters
 * and the `numberOfSamplesOver*` path counters). The histograms are also kept raw, so the call
 * level can combine them bucket by bucket — percentiles of a call cannot be averaged from the
 * percentiles of its clients.
 */
import {
	Observer,
	ObservedClient,
	percentileOfHistogram,
	RTT_HISTOGRAM_BUCKET_WIDTH_IN_MS,
	RTT_HISTOGRAM_NUMBER_OF_BUCKETS,
	type CallSummary,
	type ClientSample,
	type RttSummary,
	type ScoreSummary,
} from '../src';

/* ------------------------------------------------------------------------------------------------
 * 1. The record the application saves per client.
 * ---------------------------------------------------------------------------------------------- */

type ClientPath = 'udp' | 'tcp' | 'turn-udp' | 'turn-tcp' | 'mixed' | 'unknown';

type ClientStatsSummary = {
	clientId: string;
	samples: number;
	browser?: string;
	os?: string;
	path: ClientPath;
	rtt: RttSummary;
	maxRttInMs?: number;
	score: ScoreSummary;
	inboundPacketsLost: number;
	inboundPacketsReceived: number;
	inboundLossPct?: number;
	issues: Record<string, number>;
};

/** The `path` label is an application decision, so it is derived here rather than in the library. */
function pathOf(client: ObservedClient): ClientPath {
	const used: ClientPath[] = [];

	if (0 < client.numberOfSamplesOverUdp) used.push('udp');
	if (0 < client.numberOfSamplesOverTcp) used.push('tcp');
	if (0 < client.numberOfSamplesOverTurnUdp) used.push('turn-udp');
	if (0 < client.numberOfSamplesOverTurnTcp) used.push('turn-tcp');

	if (used.length === 0) return 'unknown';

	return used.length === 1 ? used[0] : 'mixed';
}

function summarizeClient(client: ObservedClient): ClientStatsSummary {
	const lost = client.totalInboundPacketsLost;
	const received = client.totalInboundPacketsReceived;

	return {
		clientId: client.clientId,
		samples: client.acceptedSamples,
		browser: client.browser ? `${client.browser.name} ${client.browser.version}` : undefined,
		os: client.operationSystem ? `${client.operationSystem.name} ${client.operationSystem.version}` : undefined,
		path: pathOf(client),
		// Both are frozen: safe to store as they are.
		rtt: client.rttSummary,
		maxRttInMs: client.maxRttInMs,
		score: client.scoreSummary,
		inboundPacketsLost: lost,
		inboundPacketsReceived: received,
		inboundLossPct: 0 < lost + received ? (lost / (lost + received)) * 100 : undefined,
		// Copied: `issueHistogram` is live and has no prototype, so spread it into a plain object.
		issues: { ...client.issueHistogram },
	};
}

/* ------------------------------------------------------------------------------------------------
 * 2. The call-level state the enrichers keep in `summary.attachments`.
 * ---------------------------------------------------------------------------------------------- */

type CallAttachments = {
	clients: ClientStatsSummary[];
	rttHistogram: number[];
	issues: Record<string, number>;
	regions: string[];
};

/** Typed access to the enricher-owned part of the summary, created on first use. */
function attachmentsOf(summary: CallSummary): CallAttachments {
	return (summary.attachments.app ??= {
		clients: [],
		rttHistogram: new Array(RTT_HISTOGRAM_NUMBER_OF_BUCKETS).fill(0),
		issues: {},
		regions: [],
	} satisfies CallAttachments) as CallAttachments;
}

/* ------------------------------------------------------------------------------------------------
 * 3. The observer, with built-in sections plus enrichers.
 * ---------------------------------------------------------------------------------------------- */

const observer = new Observer({
	closeCallIfEmptyForMs: undefined,
	callSummary: {
		// Built-in sections: who was there, every call issue, TURN relays, the call score.
		include: [ 'clients', 'issues', 'turnServers', 'scores' ],
		enrich: {
			// Low-frequency event, once per client: enrich from `appData` the application set.
			'client-added': (summary, { observedClient }) => {
				const region = observedClient.appData.region;

				if (typeof region === 'string' && !attachmentsOf(summary).regions.includes(region)) {
					attachmentsOf(summary).regions.push(region);
				}
			},

			// Fires once per client, also for every client still open when the call closes, and
			// always before `call-summary`. This is where a client's session is complete.
			'client-closed': (summary, { observedClient }) => {
				const app = attachmentsOf(summary);

				app.clients.push(summarizeClient(observedClient));

				observedClient.rttHistogram.forEach((count, bucket) => {
					app.rttHistogram[bucket] += count;
				});
				for (const [ type, count ] of Object.entries(observedClient.issueHistogram)) {
					app.issues[type] = (app.issues[type] ?? 0) + count;
				}
			},
		},
	},
});

observer.on('call-summary', ({ summary }) => {
	const app = attachmentsOf(summary);
	const callRttP95 = percentileOfHistogram(app.rttHistogram, RTT_HISTOGRAM_BUCKET_WIDTH_IN_MS, 0.95, {
		max: Math.max(...app.clients.map((c) => c.maxRttInMs ?? 0)),
		openEnded: true,
	});

	// in production: archive(summary) — it is plain, serialisable data.
	console.log(JSON.stringify({
		callId: summary.callId,
		durationInMs: summary.durationInMs,
		clients: summary.clients,
		callScore: summary.scores,
		callRttP95InMs: callRttP95,
		issuesByType: app.issues,
		regions: app.regions,
		perClient: app.clients,
	}, null, 2));
});

/* ------------------------------------------------------------------------------------------------
 * 4. Synthetic traffic. In production these come from client-monitor-js.
 * ---------------------------------------------------------------------------------------------- */

let now = Date.now();

type Tick = {
	rttInMs: number,
	received: number,
	lost: number,
	score: number,
	relay?: 'udp' | 'tcp',
	issues?: ClientSample['clientIssues'],
	events?: ClientSample['clientEvents'],
};

function sampleOf(clientId: string, tick: Tick): ClientSample {
	const timestamp = now;
	const pcId = `${clientId}-pc`;
	const local = tick.relay
		? { id: 'local', timestamp, candidateType: 'relay', protocol: 'udp', relayProtocol: tick.relay, url: 'turn:turn.example.com:3478' }
		: { id: 'local', timestamp, candidateType: 'srflx', protocol: 'udp' };

	return {
		callId: 'call-1',
		clientId,
		timestamp,
		score: tick.score,
		clientIssues: tick.issues,
		clientEvents: tick.events,
		clientMetaItems: [
			{ type: 'BROWSER', payload: JSON.stringify({ name: 'Chrome', version: '141' }) },
			{ type: 'OPERATION_SYSTEM', payload: JSON.stringify({ name: 'macOS', version: '15.6' }) },
		],
		peerConnections: [ {
			peerConnectionId: pcId,
			inboundRtps: [ { timestamp, id: 'in', ssrc: 1, kind: 'audio', trackIdentifier: `${clientId}-in`, packetsReceived: tick.received, packetsLost: tick.lost, bytesReceived: tick.received * 120 } ],
			inboundTracks: [ { timestamp, id: `${clientId}-in`, kind: 'audio' } ],
			mediaSources: [ { timestamp, id: 'ms', kind: 'audio', trackIdentifier: `${clientId}-out` } ],
			outboundRtps: [ { timestamp, id: 'out', ssrc: 2, kind: 'audio', trackIdentifier: `${clientId}-out`, mediaSourceId: 'ms', packetsSent: tick.received, bytesSent: tick.received * 120 } ],
			outboundTracks: [ { timestamp, id: `${clientId}-out`, kind: 'audio' } ],
			remoteInboundRtps: [ { timestamp, id: 'rin', ssrc: 2, kind: 'audio', roundTripTime: tick.rttInMs / 1000 } ],
			iceCandidates: [ local, { id: 'remote', timestamp, candidateType: 'host', protocol: 'udp' } ],
			iceCandidatePairs: [ { id: 'pair', timestamp, localCandidateId: 'local', remoteCandidateId: 'remote', nominated: true, bytesReceived: 0, bytesSent: 0 } ],
			iceTransports: [ { id: 'transport', timestamp, selectedCandidatePairId: 'pair' } ],
		} ],
	} as unknown as ClientSample;
}

const call = observer.createObservedCall({ callId: 'call-1' })!;

call.createObservedClient({ clientId: 'alice', appData: { region: 'eu-north' } });
call.createObservedClient({ clientId: 'bob', appData: { region: 'us-east' } });

// The packet counters are cumulative, as `getStats()` reports them.
let bobLost = 0;

for (let i = 0; i < 60; ++i) {
	now += 1000;

	// CLIENT_JOINED / CLIENT_LEFT give the call its `startedAt` / `endedAt`, hence `durationInMs`.
	const events = () => (i === 0 ? [ { type: 'CLIENT_JOINED', timestamp: now } ] : i === 59 ? [ { type: 'CLIENT_LEFT', timestamp: now } ] : undefined);

	// alice: healthy, direct UDP.
	observer.accept(sampleOf('alice', { rttInMs: 40 + (i % 10), received: (i + 1) * 50, lost: 0, score: 4.6, events: events() }));

	// bob: congested for a while, falls back to TURN over TCP halfway through.
	const congested = 20 <= i && i < 35;

	bobLost += congested ? 8 : (i % 10 === 0 ? 1 : 0);
	observer.accept(sampleOf('bob', {
		events: events(),
		rttInMs: congested ? 350 + (i * 5) : 120,
		received: (i + 1) * 50,
		lost: bobLost,
		score: congested ? 2.1 : 4.0,
		relay: 30 <= i ? 'tcp' : undefined,
		issues: i === 20 ? [ { type: 'network-congestion', key: 'bob:network-congestion', timestamp: now } ]
			: i === 35 ? [ { type: 'network-congestion-resolved', key: 'bob:network-congestion', timestamp: now } ]
				: undefined,
	}));
}

// Closing the call closes its clients (each fires `client-closed`), then emits `call-summary`.
call.close();
observer.close();
