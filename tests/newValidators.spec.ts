import { Observer } from '../src/Observer';
import { UNRESOLVED_TRACK_LINKS_ISSUE } from '../src/validators/RemoteTrackResolverValidator';
import { CODEC_MISMATCH_ISSUE } from '../src/validators/CodecConsistencyValidator';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import type { ClientSample } from '../src/schema/ClientSample';
import { payloadOf, type CollectedIssue } from './helpers/issues';

/**
 * The two validators that exist to make *silence* legible.
 *
 * Both guard against the same failure shape: a misconfiguration that makes several detectors do
 * nothing, which is indistinguishable from a healthy deployment unless something says so out loud.
 */

type Report = { ready: boolean, verdict?: string, checks?: number, reason?: string };

function newObserver(withResolver = true) {
	const observer = new Observer({
		autoUpdateOnCallUpdate: false,
		...(withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
	});
	const reports: { validator: string, report: Report }[] = [];
	const issues: CollectedIssue[] = [];

	observer.on('validation-ready', ({ validator, report }) => reports.push({ validator, report: report as Report }));
	observer.on('observer-issue', ({ issue }) => issues.push(issue));

	return { observer, reports, issues };
}

/* ================================================================================================
 * RemoteTrackResolverValidator
 * ============================================================================================== */

type TrackOpts = { publishes?: string, subscribes?: string };

function trackSample(clientId: string, callId: string, opts: TrackOpts): ClientSample {
	const pc: Record<string, unknown> = { peerConnectionId: `pc-${clientId}` };

	if (opts.publishes) {
		pc.mediaSources = [ { timestamp: 1000, id: `ms-${clientId}`, kind: 'video', trackIdentifier: `${clientId}-out` } ];
		pc.outboundRtps = [ {
			timestamp: 1000, id: `out-${clientId}`, ssrc: 1, kind: 'video',
			mediaSourceId: `ms-${clientId}`, bytesSent: 600_000, packetsSent: 500,
		} ];
		pc.outboundTracks = [ {
			timestamp: 1000, id: `${clientId}-out`, kind: 'video',
			attachments: { producerId: opts.publishes },
		} ];
	}

	if (opts.subscribes) {
		pc.inboundRtps = [ {
			timestamp: 1000, id: `in-${clientId}`, ssrc: 1, kind: 'video',
			trackIdentifier: `${clientId}-in`, bytesReceived: 120_000, packetsReceived: 100, packetsLost: 0,
		} ];
		pc.inboundTracks = [ {
			timestamp: 1000, id: `${clientId}-in`, kind: 'video',
			// `producerId` is what the default mediasoup resolver joins on. A wrong or missing value
			// here is exactly the misconfiguration this validator exists to catch.
			attachments: { producerId: opts.subscribes, consumerId: `consumer-${clientId}` },
		} ];
	}

	return {
		callId,
		clientId,
		timestamp: 1000,
		peerConnections: [ pc ],
	} as unknown as ClientSample;
}

/** One publisher and two subscribers in `callId`. `producerId` mismatch => no links resolve. */
function linkedCall(observer: Observer, callId: string, { broken = false } = {}) {
	const call = observer.createObservedCall({ callId, autoUpdateOnClientUpdate: false })!;

	observer.accept(trackSample(`${callId}-alice`, callId, { publishes: `p-${callId}` }));
	for (const name of [ 'bob', 'carol' ]) {
		observer.accept(trackSample(`${callId}-${name}`, callId, {
			subscribes: broken ? `wrong-${callId}` : `p-${callId}`,
		}));
	}

	return call;
}

describe('RemoteTrackResolverValidator', () => {
	it('settles as links-resolved as soon as anything is linked', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('remote-track-resolver');
		linkedCall(observer, 'call-1');
		observer.update();

		expect(reports).toHaveLength(1);
		expect(reports[0].validator).toBe('remote-track-resolver');
		expect(reports[0].report).toMatchObject({ ready: true, verdict: 'links-resolved' });
		expect(observer.validators.size).toBe(0);

		observer.close();
	});

	// The finding worth having: a resolver is configured, calls repeatedly present everything needed,
	// and nothing ever links — so four detectors are silently inert.
	it('settles as no-links-resolved and raises, after enough eligible calls', () => {
		const { observer, reports, issues } = newObserver();

		observer.addValidator('remote-track-resolver', { minChecks: 3 });

		for (const callId of [ 'call-1', 'call-2', 'call-3' ]) {
			linkedCall(observer, callId, { broken: true });
			observer.update();
		}

		expect(reports).toHaveLength(1);
		expect(reports[0].report).toMatchObject({ ready: true, verdict: 'no-links-resolved', checks: 3 });

		expect(issues).toHaveLength(1);
		expect(issues[0].type).toBe(UNRESOLVED_TRACK_LINKS_ISSUE);

		const payload = payloadOf(issues[0]);

		expect(payload.linkedInboundTracks).toBe(0);
		expect(payload.linkedRatio).toBe(0);
		expect(payload.eligibleCalls).toBe(3);
		expect(payload.conclusion.recommendation).toMatch(/producerId|id the resolver joins on/i);

		observer.close();
	});

	// Not enough eligible calls to conclude anything. Concluding "it works" from calls that had
	// nothing to resolve is precisely the mistake this validator exists to prevent.
	it('does not conclude from too few eligible calls', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('remote-track-resolver', { minChecks: 3 });

		linkedCall(observer, 'call-1', { broken: true });
		observer.update();

		expect(reports).toHaveLength(0);
		expect(observer.validators.size).toBe(1);

		observer.close();
	});

	it('ignores calls with no resolver configured', () => {
		const { observer, reports } = newObserver(false);

		observer.addValidator('remote-track-resolver', { minChecks: 1 });
		linkedCall(observer, 'call-1');
		observer.update();

		// A deployment that opted out of resolution is not a failing verdict.
		expect(reports).toHaveLength(0);

		observer.close();
	});

	it('ignores calls with too few clients or tracks to judge', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('remote-track-resolver', { minChecks: 1, minInboundTracks: 2 });

		const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;

		observer.accept(trackSample('alice', 'call-1', { publishes: 'p-1' }));
		observer.accept(trackSample('bob', 'call-1', { subscribes: 'wrong' }));
		call.update();
		observer.update();

		// One inbound track is below `minInboundTracks`: cannot tell "not linked" from "not yet".
		expect(reports).toHaveLength(0);

		observer.close();
	});

	it('finishes inconclusive when cancelled', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('remote-track-resolver');

		expect(observer.cancelValidator('remote-track-resolver', 'resolver rewritten')).toBe(1);
		expect(reports[0].report).toMatchObject({
			ready: true,
			verdict: 'inconclusive',
			reason: 'resolver rewritten',
			checks: 0,
		});

		observer.close();
	});
});

/* ================================================================================================
 * CodecConsistencyValidator
 * ============================================================================================== */

function codecSample(clientId: string, callId: string, mimeTypes: string[]): ClientSample {
	return {
		callId,
		clientId,
		timestamp: 1000,
		peerConnections: [ {
			peerConnectionId: `pc-${clientId}`,
			codecs: mimeTypes.map((mimeType, index) => ({
				timestamp: 1000,
				id: `codec-${clientId}-${index}`,
				mimeType,
				payloadType: 96 + index,
			})),
		} ],
	} as unknown as ClientSample;
}

/** A call of `size` clients, all on `mimeTypes` unless `oddOneOut` is given for the last one. */
function codecCall(observer: Observer, callId: string, mimeTypes: string[], oddOneOut?: string[]) {
	const call = observer.createObservedCall({ callId, autoUpdateOnClientUpdate: false })!;
	const names = [ 'alice', 'bob', 'carol' ];

	names.forEach((name, index) => {
		const last = index === names.length - 1;

		observer.accept(codecSample(`${callId}-${name}`, callId, last && oddOneOut ? oddOneOut : mimeTypes));
	});
	call.update();

	return call;
}

describe('CodecConsistencyValidator', () => {
	it('settles as codec-consistent once enough calls agree', () => {
		const { observer, reports, issues } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 2, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'video/VP8' ]);
		observer.update();
		codecCall(observer, 'call-2', [ 'video/VP8' ]);
		observer.update();

		expect(reports).toHaveLength(1);
		expect(reports[0].report).toMatchObject({ ready: true, verdict: 'codec-consistent', checks: 2 });
		// A pass raises nothing — only the two bad verdicts do.
		expect(issues).toHaveLength(0);

		observer.close();
	});

	// Decisive on its own: an SFU forwarding without transcoding cannot serve a split call.
	it('settles as codec-split immediately, without waiting for minChecks', () => {
		const { observer, reports, issues } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 5, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'video/VP8' ], [ 'video/H264' ]);
		observer.update();

		expect(reports).toHaveLength(1);
		expect(reports[0].report).toMatchObject({ ready: true, verdict: 'codec-split', checks: 1 });

		expect(issues).toHaveLength(1);
		expect(issues[0].type).toBe(CODEC_MISMATCH_ISSUE);
		expect(payloadOf(issues[0]).conclusion.summary).toMatch(/different codecs/i);

		observer.close();
	});

	// The quiet failure: everyone agrees, on the wrong thing.
	it('settles as unexpected-codec when the fleet silently fell back', () => {
		const { observer, reports, issues } = newObserver();

		observer.addValidator('codec-consistency', {
			minChecks: 2,
			kinds: [ 'video' ],
			expected: { video: 'video/VP9' },
		});

		codecCall(observer, 'call-1', [ 'video/VP8' ]);
		observer.update();
		codecCall(observer, 'call-2', [ 'video/VP8' ]);
		observer.update();

		expect(reports[0].report).toMatchObject({ ready: true, verdict: 'unexpected-codec' });
		expect(issues).toHaveLength(1);
		expect(payloadOf(issues[0]).conclusion.summary).toMatch(/other than the expected/i);

		observer.close();
	});

	// A peer connection lists every *negotiated* codec, including ones it never sends with. Counting
	// those would report a split in every call on earth.
	it('does not call a shared codec list a split', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 1, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'video/VP8' ]);
		observer.update();

		expect(reports[0].report).toMatchObject({ verdict: 'codec-consistent' });

		observer.close();
	});

	it('counts a call only once, however many times it is inspected', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 3, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'video/VP8' ]);
		observer.update();
		observer.update();
		observer.update();

		// One call observed three times is one check, not three — otherwise `minChecks` means nothing.
		expect(reports).toHaveLength(0);

		observer.close();
	});

	it('ignores calls below minClients', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 1, minClients: 5, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'video/VP8' ], [ 'video/H264' ]);
		observer.update();

		expect(reports).toHaveLength(0);

		observer.close();
	});

	// An audio-only deployment must never produce a verdict about video.
	it('says nothing about a kind the calls never carried', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('codec-consistency', { minChecks: 1, kinds: [ 'video' ] });

		codecCall(observer, 'call-1', [ 'audio/opus' ]);
		observer.update();

		expect(reports).toHaveLength(0);

		observer.close();
	});

	it('finishes inconclusive when the observer closes', () => {
		const { observer, reports } = newObserver();

		observer.addValidator('codec-consistency');
		observer.close();

		expect(reports).toHaveLength(1);
		expect(reports[0].report).toMatchObject({
			ready: true,
			verdict: 'inconclusive',
			reason: 'observer closed',
		});
	});
});
