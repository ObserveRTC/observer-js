/**
 * Every detector, one scenario each.
 *
 * `sfu-observer.ts` is the end-to-end tour; this file is the reference. For each of the eight
 * built-in detectors it shows:
 *
 *   - the question it answers that no single endpoint can,
 *   - how to configure it,
 *   - a synthetic scenario that makes it fire,
 *   - the finding it raises, with its `conclusion`.
 *
 * Run it with:  yarn example:detectors
 *
 * Each scenario builds its own `Observer` with **only the detector under test** enabled
 * (`observerDetectors: null, callDetectors: null`, then one explicit `add`). That is not how you would
 * configure production — there you leave them all on and switch off what you don't want — but it
 * makes each finding unambiguously attributable to one detector.
 */
import {
	Observer,
	createDefaultMediasoupRemoteTrackResolverFactory,
	ConcurrentIssueDetector,
	IssueFanOutDetector,
	TrackDeliveryMismatchDetector,
	UnconsumedTrackDetector,
	IceDisruptionDetector,
	TurnServerHealthDetector,
	TurnServerOutageDetector,
	issuePayloadOf,
	defaultCallDetectorsConfig,
	defaultObserverDetectorsConfig,
	type ObserverIssue,
	type ClientSample,
} from '../src';

/* ================================================================================================
 * Sample builders
 *
 * Real samples come from client-monitor-js. These hand-built ones keep each scenario readable and
 * make the *minimum* required shape explicit — which is genuinely useful to see, because a missing
 * `mediaSource` or a url on the wrong ICE candidate silently changes what the detectors conclude.
 * ============================================================================================== */

type Issue = { type: string, key: string, payload?: string, timestamp: number };

/** A client issue raise. `key` is what ties it to its `<type>-resolved` companion later. */
const raise = (type: string, clientId: string, timestamp: number, payload: Record<string, unknown> = {}): Issue => ({
	type,
	key: `${clientId}:${type}`,
	payload: JSON.stringify(payload),
	timestamp,
});

/** The matching resolution. Sending these is what lets the observer treat issues as intervals. */
const resolve = (type: string, clientId: string, timestamp: number, raisedAt: number): Issue => ({
	type: `${type}-resolved`,
	key: `${clientId}:${type}`,
	payload: JSON.stringify({ raisedAt, comment: 'recovered' }),
	timestamp,
});

type ClientOpts = {
	callId?: string,
	issues?: Issue[],
	/** Publishes a track under this producer id. */
	publishes?: { producerId: string, packetsSent: number, kind?: 'audio' | 'video' },
	/** Subscribes to a producer. */
	subscribes?: { producerId: string, packetsReceived: number, kind?: 'audio' | 'video' },
	/** Relays through this TURN server url. */
	turnServer?: string,
	/** Emits an ICE_CONNECTION_STATE_CHANGED client event. */
	iceState?: string,
};

function clientSample(clientId: string, timestamp: number, opts: ClientOpts = {}): ClientSample {
	const peerConnectionId = `pc-${clientId}`;
	const pc: Record<string, unknown> = { peerConnectionId };

	if (opts.publishes) {
		const { producerId, packetsSent, kind = 'video' } = opts.publishes;
		const trackId = `${clientId}-out`;

		// The media source is the link from an outbound TRACK to its outbound RTP streams
		// (`mediaSource.trackIdentifier` -> `outboundRtp.mediaSourceId`). Omit it and the track has no
		// RTPs, so "is this publisher sending?" reads as no.
		pc.mediaSources = [ { timestamp, id: `ms-${clientId}`, kind, trackIdentifier: trackId } ];
		pc.outboundRtps = [ {
			timestamp, id: `out-${clientId}`, ssrc: 1, kind, mediaSourceId: `ms-${clientId}`,
			bytesSent: packetsSent * 1200, packetsSent,
		} ];
		pc.outboundTracks = [ { timestamp, id: trackId, kind, attachments: { producerId } } ];
	}

	if (opts.subscribes) {
		const { producerId, packetsReceived, kind = 'video' } = opts.subscribes;
		const trackId = `${clientId}-in`;

		pc.inboundRtps = [ {
			timestamp, id: `in-${clientId}`, ssrc: 1, kind, trackIdentifier: trackId,
			bytesReceived: packetsReceived * 1200, packetsReceived, packetsLost: 0,
		} ];
		// `producerId` links this inbound track back to its publisher; `consumerId` identifies the
		// subscription. The default mediasoup resolver reads exactly these two attachments.
		pc.inboundTracks = [ {
			timestamp, id: trackId, kind,
			attachments: { producerId, consumerId: `consumer-${clientId}` },
		} ];
	}

	if (opts.turnServer) {
		// Per W3C webrtc-stats the ICE server url appears only on the LOCAL candidate. A `relay` local
		// candidate is by definition obtained from a TURN server.
		pc.iceCandidates = [
			{ timestamp, id: `lc-${clientId}`, protocol: 'udp', candidateType: 'relay', url: `${opts.turnServer}?transport=udp` },
			{ timestamp, id: `rc-${clientId}`, protocol: 'udp', candidateType: 'host' },
		];
		pc.iceCandidatePairs = [ {
			timestamp, id: `pair-${clientId}`, localCandidateId: `lc-${clientId}`,
			remoteCandidateId: `rc-${clientId}`, nominated: true, bytesReceived: 1000, bytesSent: 1000,
		} ];
		pc.iceTransports = [ { timestamp, id: `tr-${clientId}`, selectedCandidatePairId: `pair-${clientId}` } ];
	}

	return {
		callId: opts.callId ?? 'call-1',
		clientId,
		timestamp,
		peerConnections: [ pc ],
		clientIssues: opts.issues,
		// ICE state is a transition, so it arrives as an event rather than a sampled field.
		clientEvents: opts.iceState
			? [ {
				type: 'ICE_CONNECTION_STATE_CHANGED',
				timestamp,
				payload: JSON.stringify({ peerConnectionId, iceConnectionState: opts.iceState }),
			} ]
			: undefined,
	} as unknown as ClientSample;
}

/* ================================================================================================
 * Harness
 * ============================================================================================== */

function newObserver(withResolver = true) {
	return new Observer({
		...(withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
		// Manual updates so each scenario controls exactly when detectors run.
		updatePolicy: 'none',
		defaultCallUpdatePolicy: 'none',
		// Only the detector under test — see the file header.
		observerDetectors: null,
		callDetectors: null,
	});
}

let scenarioNumber = 0;

function heading(title: string, question: string) {
	console.log(`\n${'─'.repeat(96)}`);
	console.log(`${++scenarioNumber}. ${title}`);
	console.log(`   asks: ${question}`);
	console.log('─'.repeat(96));
}

/** Print a finding compactly: the type, the evidence that matters, and the conclusion. */
function report(scope: string, issue: ObserverIssue) {
	// No parsing: an observer-raised finding carries the payload object itself.
	const { conclusion, type: _t, ...evidence } = issuePayloadOf(issue) ?? {};

	console.log(`\n  ✔ [${scope}] ${issue.type}`);
	for (const [ key, value ] of Object.entries(evidence)) {
		if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
		console.log(`      ${key.padEnd(24)} ${JSON.stringify(value)}`);
	}
	if (conclusion) {
		const verdict = conclusion as { faultDomain: string, summary: string, recommendation?: string, confidence: number };

		console.log(`      ${'→ faultDomain'.padEnd(24)} ${verdict.faultDomain}  (confidence ${verdict.confidence})`);
		console.log(`      ${'→ summary'.padEnd(24)} ${verdict.summary}`);
		if (verdict.recommendation) console.log(`      ${'→ do'.padEnd(24)} ${verdict.recommendation}`);
	}
}

/** Collect findings from both buses for the duration of one scenario. */
function watch(observer: Observer) {
	const found: string[] = [];

	observer.on('call-issue', ({ issue }) => (report('call', issue), found.push(issue.type)));
	observer.on('observer-issue', ({ issue }) => (report('observer', issue), found.push(issue.type)));

	return {
		get types() { return found; },
		none(why: string) { if (found.length === 0) console.log(`\n  · silent — ${why}`); },
	};
}

/* ================================================================================================
 * 1. ConcurrentIssueDetector (call scope)
 * ============================================================================================== */

function concurrentIssuesInOneCall() {
	heading(
		'ConcurrentIssueDetector — call scope',
		'is this MEETING in trouble, or is it one person\'s Wi-Fi?',
	);

	const observer = newObserver();
	const found = watch(observer);

	observer.accept(clientSample('alice', 1000));

	const call = observer.getObservedCall('call-1')!;
	const detector = new ConcurrentIssueDetector(call, { ...defaultCallDetectorsConfig.concurrentIssueDetector, // issueTypes: [] (default) means every type the clients report — usually what you want, since
		// the detector is generic over the client's vocabulary.
		issueTypes: [],
		minClients: 3,            // below this a ratio means nothing
		minAffectedClients: 3,
		affectedRatioThreshold: 0.5,
		onsetBurstWindowInMs: 2_000,  // onsets this close escalate to ISSUE_ONSET_BURST
		cooldownMs: 60_000 });

	call.detectors.add(detector);

	// Four participants; three report congestion within a few ms of each other.
	for (const clientId of [ 'alice', 'bob', 'carol' ]) {
		observer.accept(clientSample(clientId, 2000, { issues: [ raise('congestion', clientId, 2000) ] }));
	}
	observer.accept(clientSample('dave', 2000));

	call.update();
	detector.update();

	// Concurrency is judged from OPEN INTERVALS, not a time window. Resolve them and the cohort
	// empties immediately — no guessing about whether the symptom is still happening.
	for (const clientId of [ 'alice', 'bob', 'carol' ]) {
		observer.accept(clientSample(clientId, 3000, { issues: [ resolve('congestion', clientId, 3000, 2000) ] }));
	}
	call.update();

	console.log(`\n  after the clients resolved: ${detector.lastCohorts.length} open cohort(s)`);

	observer.close();

	return found;
}

/* ================================================================================================
 * 2. ConcurrentIssueDetector (observer scope)
 * ============================================================================================== */

function concurrentIssuesAcrossCalls() {
	heading(
		'ConcurrentIssueDetector — observer scope',
		'is our INFRASTRUCTURE in trouble? (not the same question with a bigger denominator)',
	);

	const observer = newObserver();
	const found = watch(observer);

	const detector = new ConcurrentIssueDetector(observer, { ...defaultObserverDetectorsConfig.concurrentIssueDetector, minAffectedClients: 3,
		// The gate that makes an observer-scope finding mean something a call-scope one doesn't:
		// the cohort must span independent calls. Clients in different calls share no room, no
		// publisher and no host — only the servers.
		minAffectedCalls: 2,
		// Note `affectedRatioThreshold` is NOT applied at observer scope: a real fleet event is a
		// small share of all clients, so a participant ratio would suppress exactly what we want.
		affectedCallRatioThreshold: 0 });

	observer.detectors.add(detector);

	// Three unrelated calls of ten participants each. One client per call becomes congested —
	// 3 of 30 clients, a 10% participant ratio, but spread across three independent calls.
	for (const callId of [ 'sales-standup', 'design-review', 'customer-demo' ]) {
		observer.accept(clientSample(`${callId}-1`, 1000, {
			callId,
			issues: [ raise('congestion', `${callId}-1`, 1000) ],
		}));
		for (let n = 2; n <= 10; n++) observer.accept(clientSample(`${callId}-${n}`, 1000, { callId }));
	}

	observer.update();
	detector.update();

	found.none('nothing spanning enough calls');
	observer.close();

	return found;
}

/* ================================================================================================
 * 3. IssueFanOutDetector
 * ============================================================================================== */

function issueFanOut() {
	heading(
		'IssueFanOutDetector 🔗',
		'does this issue follow one PUBLISHED TRACK, or one receiver?',
	);

	const observer = newObserver();
	const found = watch(observer);

	observer.accept(clientSample('alice', 1000, { publishes: { producerId: 'alice-mic', packetsSent: 100, kind: 'audio' } }));

	const call = observer.getObservedCall('call-1')!;
	const detector = new IssueFanOutDetector(call, { ...defaultCallDetectorsConfig.issueFanOutDetector, issueTypes: [],              // any type; audio and video fan out identically
		minReceivers: 3,
		affectedRatioThreshold: 0.6, // "most of this track's subscribers"
		reportSingleReceiver: true,  // also report the "exactly one receiver" case
		cooldownMs: 60_000 });

	call.detectors.add(detector);

	// Alice publishes audio; Bob, Carol and Dave subscribe. Three of three report concealment —
	// the fault follows Alice's track, so her uplink or the SFU's forwarding of it is implicated
	// and the receivers are exonerated.
	observer.accept(clientSample('alice', 2000, { publishes: { producerId: 'alice-mic', packetsSent: 200, kind: 'audio' } }));
	for (const clientId of [ 'bob', 'carol', 'dave' ]) {
		observer.accept(clientSample(clientId, 2000, {
			subscribes: { producerId: 'alice-mic', packetsReceived: 200, kind: 'audio' },
			issues: [ raise('audio-concealment', clientId, 2000, { trackId: `${clientId}-in` }) ],
		}));
	}

	call.update();
	detector.update();

	observer.close();

	return found;
}

/* ================================================================================================
 * 4. TrackDeliveryMismatchDetector
 * ============================================================================================== */

function trackDeliveryMismatch() {
	heading(
		'TrackDeliveryMismatchDetector 🔗',
		'a dry track means camera-off, forwarding failure, OR a wedged consumer — which one?',
	);

	console.log(`
   publisher | subscribers | verdict
   ----------|-------------|--------------------------------------------------
   sending   | ALL dry     | PUBLISHED_TRACK_NOT_DELIVERED  → forwarding path
   sending   | SOME dry    | RECEIVER_TRACK_NOT_DELIVERED   → those consumers
   dry       | any dry     | PUBLISHER_TRACK_DRY            → the source stopped`);

	const observer = newObserver();
	const found = watch(observer);

	observer.accept(clientSample('alice', 1000, { publishes: { producerId: 'alice-cam', packetsSent: 100 } }));

	const call = observer.getObservedCall('call-1')!;

	call.detectors.add(new TrackDeliveryMismatchDetector(call, { ...defaultCallDetectorsConfig.trackDeliveryMismatchDetector, dryInboundIssueType: 'dry-inbound-track',
		dryOutboundIssueType: 'dry-outbound-track',
		minReceivers: 2,
		allReceiversRatio: 1,   // ALL subscribers must be dry for the whole-track verdict
		cooldownMs: 60_000 }));

	// tick 1 — healthy, establishing the counter baselines every delta is measured from.
	for (const clientId of [ 'bob', 'carol', 'dave' ]) {
		observer.accept(clientSample(clientId, 1000, { subscribes: { producerId: 'alice-cam', packetsReceived: 100 } }));
	}
	call.update();

	// tick 2 — Alice's packetsSent keeps climbing (she IS sending) while every subscriber's stalls
	// and reports dry. Packets demonstrably left the publisher and nobody received them.
	observer.accept(clientSample('alice', 2000, { publishes: { producerId: 'alice-cam', packetsSent: 400 } }));
	for (const clientId of [ 'bob', 'carol', 'dave' ]) {
		observer.accept(clientSample(clientId, 2000, {
			subscribes: { producerId: 'alice-cam', packetsReceived: 100 },
			issues: [ raise('dry-inbound-track', clientId, 2000, { trackId: `${clientId}-in` }) ],
		}));
	}
	call.update();

	observer.close();

	return found;
}

/* ================================================================================================
 * 5. SimulcastReceiverValidator
 * ============================================================================================== */

function simulcast() {
	heading(
		'SimulcastReceiverValidator 🔗  (a VALIDATOR — it finishes)',
		'does this SFU pick layers per receiver, or drag the publisher down to the worst one?',
	);

	console.log(`
   Simulcast exists to stop one slow participant setting everyone's quality. With several encodings
   the server hands the struggling receiver a lower layer and leaves the rest alone. Without it — or
   with a server that relays RTCP so the publisher's bandwidth estimate collapses to the slowest
   receiver — the only way to serve them is to make the SOURCE send less, and everybody gets the
   lowest common denominator.

   That is a property of the SFU BUILD, so this is a one-shot check rather than a detector: it runs
   until it can decide, reports once on 'validator-settled', and the observer drops it. Start another
   after a deploy.

   The good verdict needs positive evidence. The check only runs when a publisher has 3+ receivers
   and one is far worse than the median; plenty of healthy fleets never present that. Those are
   counted as \`checks\`, and a validator that never sees them simply never finishes — it does not
   quietly pass.`);

	const observer = newObserver();

	observer.on('validator-settled', ({ validator, report }) => {
		if (!report.ready) return;

		console.log(`\n  ✔ [validator] ${validator} → ${String(report.verdict).toUpperCase()}`);
		console.log(`      ${'checks'.padEnd(24)} ${report.checks}`);
		const evidence = report.evidence as { worstReceiverClientId?: string } | undefined;

		if (evidence) console.log(`      ${'worst receiver'.padEnd(24)} ${evidence.worstReceiverClientId}`);
	});

	observer.accept(clientSample('alice', 1000, { publishes: { producerId: 'alice-cam', packetsSent: 0 } }));
	// one clean check is enough for the demo; the default is 3
	observer.addValidator('simulcast-receiver-validator', { minSamples: 4, minChecks: 1 });

	// bob and carol hold steady; dave collapses. The publisher IGNORES dave — layers are per receiver.
	const steady = 8_000_000;
	const collapsing = [ 2_000_000, 1_600_000, 1_200_000, 800_000, 400_000 ];
	const cumulative = (bps: number[], upto: number) => bps.slice(0, upto).reduce((b, v) => b + (v / 8), 0);

	for (let tick = 0; tick <= 5; tick++) {
		const timestamp = 1000 + (tick * 1000);

		for (const [ clientId, profile ] of [
			[ 'bob', Array(5).fill(steady) ], [ 'carol', Array(5).fill(steady) ], [ 'dave', collapsing ],
		] as [string, number[]][]) {
			observer.accept({
				callId: 'call-1', clientId, timestamp,
				peerConnections: [ {
					peerConnectionId: `pc-${clientId}`,
					inboundRtps: [ {
						timestamp, id: `in-${clientId}`, ssrc: 1, kind: 'video', trackIdentifier: `${clientId}-in`,
						bytesReceived: cumulative(profile, tick), packetsReceived: tick * 100, packetsLost: 0,
					} ],
					inboundTracks: [ {
						timestamp, id: `${clientId}-in`, kind: 'video',
						attachments: { producerId: 'alice-cam', consumerId: `consumer-${clientId}` },
					} ],
				} ],
			} as unknown as ClientSample);
		}
		// Alice holds her bitrate regardless of dave — the behaviour being validated.
		observer.accept({
			callId: 'call-1', clientId: 'alice', timestamp,
			peerConnections: [ {
				peerConnectionId: 'pc-alice',
				mediaSources: [ { timestamp, id: 'ms-alice', kind: 'video', trackIdentifier: 'alice-out' } ],
				outboundRtps: [ {
					timestamp, id: 'out-alice', ssrc: 1, kind: 'video', mediaSourceId: 'ms-alice',
					bytesSent: cumulative(Array(5).fill(steady), tick), packetsSent: tick * 100,
				} ],
				outboundTracks: [ { timestamp, id: 'alice-out', kind: 'video', attachments: { producerId: 'alice-cam' } } ],
			} ],
		} as unknown as ClientSample);

		if (0 < tick) {
			observer.getObservedCall('call-1')?.update();
			observer.update();
		}
	}

	console.log(`
   It is gone now (observer.validators.size === ${observer.validators.size}), so it costs nothing from
   here. Had no receiver ever lagged it would simply still be running, never reporting — which is the
   honest outcome, not a pass.`);

	observer.close();

	return { types: [] as string[] };
}

/* ================================================================================================
 * 6. UnconsumedTrackDetector
 * ============================================================================================== */

function unconsumedTrack() {
	heading(
		'UnconsumedTrackDetector 🔗',
		'is someone publishing a track that NOBODY receives?',
	);

	const observer = newObserver();
	const found = watch(observer);

	observer.accept(clientSample('alice', 1000, { publishes: { producerId: 'alice-cam', packetsSent: 100 } }));

	const call = observer.getObservedCall('call-1')!;

	call.detectors.add(new UnconsumedTrackDetector(call, { ...defaultCallDetectorsConfig.unconsumedTrackDetector, // NOTE this clock is the observer's WALL clock, not the sample timestamps — an unconsumed
		// track is a duration of real elapsed time, not of replayed data. A synthetic replay cannot
		// fast-forward it, so the demo uses 0. In production keep the 30s default: a brief gap
		// between publishing and the first subscription is completely normal at join time.
		minUnconsumedDurationInMs: 0,
		minBitrate: 1_000,                 // must be genuinely sending, not just present
		cooldownMs: 300_000 }));

	// Alice keeps sending; bob and carol are in the call but subscribe to nothing of hers. Wasted
	// uplink, and usually a signalling bug — the consumer was never created.
	for (let tick = 1; tick <= 5; tick++) {
		const timestamp = 1000 + (tick * 1000);

		observer.accept(clientSample('alice', timestamp, {
			publishes: { producerId: 'alice-cam', packetsSent: tick * 1000 },
		}));
		observer.accept(clientSample('bob', timestamp));
		observer.accept(clientSample('carol', timestamp));
		call.update();
	}

	found.none('the track was consumed, or not sending long enough');
	observer.close();

	return found;
}

/* ================================================================================================
 * 7. IceDisruptionDetector
 * ============================================================================================== */

function iceDisruption() {
	heading(
		'IceDisruptionDetector',
		'did many participants lose ICE within the same few seconds?',
	);

	console.log(`
   The one detector that does NOT read client issues. It reads raw ICE state transitions, which
   arrive in every sample regardless of what the client runs and which can occur and revert between
   two update() ticks — so it subscribes to the bus and implements close(). One client losing ICE is
   routine; most of them doing it within seconds is an infrastructure event.`);

	const observer = newObserver();
	const found = watch(observer);

	observer.accept(clientSample('alice', 1000, { iceState: 'connected' }));

	const call = observer.getObservedCall('call-1')!;
	const detector = new IceDisruptionDetector(call, { ...defaultCallDetectorsConfig.iceDisruptionDetector, minClients: 3,
		affectedRatioThreshold: 0.5,
		windowMs: 10_000,    // transitions are counted inside this sliding window
		cooldownMs: 60_000 });

	call.detectors.add(detector);

	for (const clientId of [ 'alice', 'bob', 'carol', 'dave' ]) {
		observer.accept(clientSample(clientId, 1000, { iceState: 'connected' }));
	}
	call.update();

	// Three of four transition to disconnected/failed at once — a dead SFU worker stops answering
	// ICE binding requests for every transport on it simultaneously (mediasoup is ICE-Lite), which
	// is what makes this synchronized rather than coincidental.
	for (const clientId of [ 'alice', 'bob', 'carol' ]) {
		observer.accept(clientSample(clientId, 2000, { iceState: 'disconnected' }));
	}
	observer.accept(clientSample('dave', 2000, { iceState: 'connected' }));

	call.update();
	detector.update();

	// It holds bus subscriptions, so it implements close(). Removing it or closing the call cleans up.
	call.detectors.remove(detector);

	observer.close();

	return found;
}

/* ================================================================================================
 * 8. TurnServerHealthDetector
 * ============================================================================================== */

function turnServerHealth() {
	heading(
		'TurnServerHealthDetector',
		'does trouble CLUSTER on one relay while the other relays are fine?',
	);

	const observer = newObserver();
	const found = watch(observer);

	const detector = new TurnServerHealthDetector(observer, { ...defaultObserverDetectorsConfig.turnServerHealthDetector, minClientsPerServer: 5,
		degradedRatioThreshold: 0.5,
		issueTypes: [],        // any open issue: the question is where trouble clusters, not what it is
		consecutiveTicks: 1,   // production default is 2
		cooldownMs: 60_000 });

	observer.detectors.add(detector);

	const DEGRADED = 'turn:eu-west-1.example.org:3478';
	const HEALTHY = 'turn:eu-west-2.example.org:3478';

	// Six clients on each relay. On eu-west-1 five of six are unhappy; on eu-west-2 nobody is.
	// Neither number means anything alone — the comparison is the finding.
	for (let n = 1; n <= 6; n++) {
		observer.accept(clientSample(`bad-${n}`, 1000, {
			turnServer: DEGRADED,
			issues: n <= 5 ? [ raise('congestion', `bad-${n}`, 1000) ] : undefined,
		}));
		observer.accept(clientSample(`good-${n}`, 1000, { turnServer: HEALTHY }));
	}

	observer.update();
	detector.update();

	console.log('\n  per-server rollup (also readable directly, for dashboards):');
	for (const server of detector.lastServers) {
		console.log(`      ${server.serverUrl.padEnd(38)} ${server.degradedClients}/${server.clients} degraded`);
	}

	observer.close();

	return found;
}

/* ================================================================================================
 * 9. TurnServerOutageDetector
 * ============================================================================================== */

function turnServerOutage() {
	heading(
		'TurnServerOutageDetector',
		'did a TURN server\'s clients DISAPPEAR while the rest of the fleet carried on?',
	);

	console.log(`
   The case TurnServerHealthDetector structurally cannot see. That detector needs clients ON the
   server to ask how many are unhappy. When a relay fails completely, allocation fails: sessions
   drop and new clients never obtain a relay candidate through it, so its population goes to zero
   and the health detector falls silent for the worst possible reason.

   Degradation makes clients unhappy; an outage makes them DISAPPEAR.`);

	const observer = newObserver();
	const found = watch(observer);

	const detector = new TurnServerOutageDetector(observer, { ...defaultObserverDetectorsConfig.turnServerOutageDetector, minClientsAtPeak: 5,          // it must have been carrying real traffic
		lossRatioThreshold: 0.8,      // an outage is near-total by definition
		peakWindowMs: 120_000,
		// The heart of the design. A call ending, everyone leaving at 6pm and a fleet-wide network
		// event all produce an identical collapse — absence only means "outage" relative to others
		// who are demonstrably fine.
		requireControlGroup: true,
		minControlGroupClients: 5,
		controlGroupHealthyRatio: 0.7,
		consecutiveTicks: 1,
		cooldownMs: 300_000 });

	observer.detectors.add(detector);

	const DEAD = 'turn:eu-west-1.example.org:3478';
	const ALIVE = 'turn:eu-west-2.example.org:3478';

	// Both relays healthy — this establishes each server's peak population.
	for (let n = 1; n <= 6; n++) {
		observer.accept(clientSample(`dying-${n}`, 1000, { turnServer: DEAD, iceState: 'connected' }));
		observer.accept(clientSample(`surviving-${n}`, 1000, { turnServer: ALIVE, iceState: 'connected' }));
	}
	observer.update();
	detector.update();

	// eu-west-1 dies. Its clients fail ICE; eu-west-2's carry on — that is the control group.
	for (let n = 1; n <= 6; n++) {
		observer.accept(clientSample(`dying-${n}`, 2000, { turnServer: DEAD, iceState: 'failed' }));
		observer.accept(clientSample(`surviving-${n}`, 2000, { turnServer: ALIVE, iceState: 'connected' }));
	}
	observer.update();
	detector.update();

	console.log(`
   Worth knowing: clients that fail over cleanly to another relay still count as lost here. That is
   intended — the failover worked AND the server is down are both true, and you want the second.`);

	observer.close();

	return found;
}

/* ================================================================================================
 * Production configuration
 * ============================================================================================== */

function productionConfig() {
	heading('Putting it together', 'what this looks like when you are not demonstrating one at a time');

	console.log(`
   In production you do not construct detectors: you configure them. Every slot is
   \`undefined\` (defaults), an object (overrides), or \`null\` (do not create).`);

	const observer = new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		updatePolicy: 'update-when-all-call-updated',
		defaultCallUpdatePolicy: 'update-when-all-client-updated',

		observerDetectors: {
			concurrentIssueDetector: { minAffectedCalls: 3 },   // stricter fleet gate
			turnServerOutageDetector: { minClientsAtPeak: 20 }, // large deployment
			// turnServerHealthDetector omitted -> created with defaults
		},

		callDetectors: {
			iceDisruptionDetector: null,   // our clients report ice-* issues themselves
		},

	});

	console.log(`\n   observer.detectors  : ${observer.detectors.listOfNames.join(', ')}`);

	observer.createObservedCall({ callId: 'x' });
	console.log(`   call.detectors      : ${observer.getObservedCall('x')!.detectors.listOfNames.join(', ')}`);
	// A validator is started explicitly, not configured — it is a one-shot check.
	observer.addValidator('simulcast-receiver-validator', { minChecks: 5 });
	console.log(`   running validators  : ${[ ...observer.validators ].map((v) => v.name).join(', ')}`);

	console.log(`
   Route by fault domain rather than by issue type — the domain is what tells you who to wake:

     observer.on('observer-issue', ({ issue }) => {
       const { conclusion } = issuePayloadOf(issue) ?? {};
       if (conclusion?.faultDomain === 'infrastructure') page(conclusion.summary);
       if (conclusion?.faultDomain === 'client-population') fileClientBug(conclusion.summary);
     });

   And start a validator after each deploy, recording whatever it reports:

     onDeploy(() => observer.addValidator('simulcast-receiver-validator'));
     observer.on('validator-settled', ({ validator, report }) => record(validator, report));

   If it never reports, the check never found the conditions it needs — which is worth knowing too.

   That second line is the one worth having: cpu-limitation spread across independent calls is NOT
   an SFU symptom. Endpoint CPU is owned by the endpoint, so breadth points at a shared client
   release or browser version — paging the SFU on-call would be wrong.`);

	observer.close();
}

/* ================================================================================================
 * Run
 * ============================================================================================== */

const scenarios: (() => { types: string[] } | void)[] = [
	concurrentIssuesInOneCall,
	concurrentIssuesAcrossCalls,
	issueFanOut,
	trackDeliveryMismatch,
	simulcast,
	unconsumedTrack,
	iceDisruption,
	turnServerHealth,
	turnServerOutage,
];

console.log('observer-js — the built-in detectors, one scenario each');

const raised: string[] = [];

for (const scenario of scenarios) {
	const result = scenario();

	if (result) raised.push(...result.types);
}

productionConfig();

console.log(`\n${'═'.repeat(96)}`);
console.log(`${raised.length} findings raised: ${[ ...new Set(raised) ].join(', ')}`);
console.log('═'.repeat(96));

// Keep the harness honest: if a scenario silently stops firing this must fail loudly, rather than
// quietly printing a shorter list that still looks plausible.
const expected = [
	'ISSUE_ONSET_BURST',
	'CROSS_CALL_ISSUE_ONSET_BURST',
	'PUBLISHED_TRACK_ISSUE_FAN_OUT',
	'PUBLISHED_TRACK_NOT_DELIVERED',
	'UNCONSUMED_PUBLISHED_TRACK',
	'CALL_ICE_DISRUPTION',
	'TURN_SERVER_DEGRADED',
	'TURN_SERVER_OUTAGE',
];
const missing = expected.filter((type) => !raised.includes(type));

if (0 < missing.length) {
	console.error(`\nMISSING findings: ${missing.join(', ')}`);
	process.exitCode = 1;
}
