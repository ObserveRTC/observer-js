import { Observer } from '../src/Observer';
import { PublisherFaultTypes } from '../src/detectors/PublisherFaultCorroborationDetector';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import type { ClientSample } from '../src/schema/ClientSample';
import { payloadOf, type CollectedIssue } from './helpers/issues';

/**
 * `PublisherFaultCorroborationDetector` — do **both ends** of one published track agree?
 *
 * The distinction from `IssueFanOutDetector` is the whole point, and it is what these tests pin: one
 * end complaining is fan-out's business and must leave this detector silent. It only speaks when the
 * publisher reports trouble on its own send path *while* its subscribers report trouble receiving it.
 */

type Issue = { type: string, key: string, payload: string, timestamp: number };

const raise = (type: string, clientId: string, trackId: string): Issue => ({
	type,
	key: `${clientId}:${type}`,
	payload: JSON.stringify({ trackId }),
	timestamp: 1000,
});

type Opts = {
	publishes?: string,
	subscribes?: string,
	issues?: Issue[],
};

function sample(clientId: string, opts: Opts): ClientSample {
	const pc: Record<string, unknown> = { peerConnectionId: `pc-${clientId}` };

	if (opts.publishes) {
		const trackId = `${clientId}-out`;

		pc.mediaSources = [ { timestamp: 1000, id: `ms-${clientId}`, kind: 'video', trackIdentifier: trackId } ];
		pc.outboundRtps = [ {
			timestamp: 1000, id: `out-${clientId}`, ssrc: 1, kind: 'video',
			mediaSourceId: `ms-${clientId}`, bytesSent: 600_000, packetsSent: 500,
		} ];
		pc.outboundTracks = [ { timestamp: 1000, id: trackId, kind: 'video', attachments: { producerId: opts.publishes } } ];
	}

	if (opts.subscribes) {
		const trackId = `${clientId}-in`;

		pc.inboundRtps = [ {
			timestamp: 1000, id: `in-${clientId}`, ssrc: 1, kind: 'video',
			trackIdentifier: trackId, bytesReceived: 120_000, packetsReceived: 100, packetsLost: 0,
		} ];
		pc.inboundTracks = [ {
			timestamp: 1000, id: trackId, kind: 'video',
			attachments: { producerId: opts.subscribes, consumerId: `consumer-${clientId}` },
		} ];
	}

	return {
		callId: 'call-1',
		clientId,
		timestamp: 1000,
		peerConnections: [ pc ],
		clientIssues: opts.issues,
	} as unknown as ClientSample;
}

const config = {
	publisherIssueTypes: [ 'encoder-bottleneck', 'dry-outbound-track' ],
	receiverIssueTypes: [ 'freezed-video-track', 'dry-inbound-track' ],
	minAffectedReceivers: 2,
};

function newObserver(withResolver = true) {
	const observer = new Observer({
		autoUpdateOnCallUpdate: false,
		...(withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
	});
	const found: CollectedIssue[] = [];

	observer.on('call-issue', ({ issue }) => found.push(issue));

	return { observer, found };
}

/** Alice publishes; bob/carol/dave subscribe. `alicesIssue` and `receiversIssue` are optional halves. */
function scenario(
	observer: Observer,
	{ alicesIssue, receiversIssue, affectedReceivers = 2 }:
	{ alicesIssue?: string, receiversIssue?: string, affectedReceivers?: number },
) {
	// Explicit updates only: with the default per-client auto-update the detector fires the moment
	// the second receiver's issue lands, before the third subscriber has even been accepted — so the
	// finding would be a snapshot of a half-arrived call rather than of the scenario being described.
	const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;

	observer.accept(sample('alice', {
		publishes: 'p-alice',
		issues: alicesIssue ? [ raise(alicesIssue, 'alice', 'alice-out') ] : undefined,
	}));

	const receivers = [ 'bob', 'carol', 'dave' ];

	receivers.forEach((clientId, index) => {
		observer.accept(sample(clientId, {
			subscribes: 'p-alice',
			issues: receiversIssue && index < affectedReceivers
				? [ raise(receiversIssue, clientId, `${clientId}-in`) ]
				: undefined,
		}));
	});

	call.update();

	return call;
}

describe('PublisherFaultCorroborationDetector', () => {
	it('reports when the publisher and its subscribers both complain', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);
		scenario(observer, { alicesIssue: 'encoder-bottleneck', receiversIssue: 'freezed-video-track' });

		expect(found).toHaveLength(1);
		expect(found[0].type).toBe(PublisherFaultTypes.corroboratedPublisherFault);

		const payload = payloadOf(found[0]);

		expect(payload.trackId).toBe('alice-out');
		expect(payload.publisherClientId).toBe('alice');
		expect(payload.publisherIssueTypes).toEqual([ 'encoder-bottleneck' ]);
		expect(payload.receiverIssueTypes).toEqual([ 'freezed-video-track' ]);
		expect(payload.receivers).toBe(3);
		expect(payload.affectedReceivers).toBe(2);
		expect(payload.affectedClientIds.sort()).toEqual([ 'bob', 'carol' ]);
		expect(payload.conclusion.faultDomain).toBe('published-track');
		// Two independent parties, one conclusion — the highest confidence the library issues.
		expect(payload.conclusion.confidence).toBe(0.9);

		observer.close();
	});

	// This is the case `IssueFanOutDetector` exists for: the receivers are unhappy but the publisher
	// says nothing, so the fault could be the SFU's forwarding. Nothing is corroborated.
	it('stays silent when only the receivers complain', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);
		scenario(observer, { receiversIssue: 'freezed-video-track', affectedReceivers: 3 });

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('stays silent when only the publisher complains', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);
		scenario(observer, { alicesIssue: 'encoder-bottleneck' });

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('stays silent below minAffectedReceivers', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);
		scenario(observer, {
			alicesIssue: 'encoder-bottleneck',
			receiversIssue: 'freezed-video-track',
			affectedReceivers: 1,
		});

		expect(found).toHaveLength(0);

		observer.close();
	});

	// Without publisher<->subscriber links there is no "the receivers of this track" to correlate.
	it('does nothing without a RemoteTrackResolver', () => {
		const { observer, found } = newObserver(false);

		observer.addCallDetector('publisher-fault-corroboration-detector', config);
		scenario(observer, { alicesIssue: 'encoder-bottleneck', receiversIssue: 'freezed-video-track' });

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('ignores issue types it was not asked to watch', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', {
			...config,
			receiverIssueTypes: [ 'dry-inbound-track' ],
		});
		scenario(observer, { alicesIssue: 'encoder-bottleneck', receiversIssue: 'freezed-video-track' });

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('honours the cooldown', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', { ...config, cooldownMs: 60_000 });

		const call = scenario(observer, {
			alicesIssue: 'encoder-bottleneck',
			receiversIssue: 'freezed-video-track',
		});

		expect(found).toHaveLength(1);

		call.update();
		call.update();

		expect(found).toHaveLength(1);

		observer.close();
	});

	it('drops what it holds and unsubscribes when removed', () => {
		const { observer } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);

		const call = scenario(observer, {
			alicesIssue: 'encoder-bottleneck',
			receiversIssue: 'freezed-video-track',
		});
		const detector = call.detectors.get('publisher-fault-corroboration-detector') as unknown as { size: number };

		// One publisher-side issue + two receiver-side ones.
		expect(detector.size).toBe(3);

		call.removeDetector('publisher-fault-corroboration-detector');

		expect(detector.size).toBe(0);
		expect(call.detectors.size).toBe(0);

		observer.close();
	});

	// An issue with no `trackId` cannot be attached to either end of a specific stream.
	it('ignores issues that do not name a track', () => {
		const { observer, found } = newObserver();

		observer.addCallDetector('publisher-fault-corroboration-detector', config);

		const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;

		observer.accept({
			...sample('alice', { publishes: 'p-alice' }),
			clientIssues: [ { type: 'encoder-bottleneck', key: 'alice:encoder-bottleneck', timestamp: 1000 } ],
		} as ClientSample);

		for (const clientId of [ 'bob', 'carol' ]) {
			observer.accept(sample(clientId, {
				subscribes: 'p-alice',
				issues: [ raise('freezed-video-track', clientId, `${clientId}-in`) ],
			}));
		}

		call.update();

		const detector = call.detectors.get('publisher-fault-corroboration-detector') as unknown as { size: number };

		// Only the two receiver-side issues were kept; alice's untracked one was dropped on arrival.
		expect(detector.size).toBe(2);
		expect(found).toHaveLength(0);

		observer.close();
	});
});
