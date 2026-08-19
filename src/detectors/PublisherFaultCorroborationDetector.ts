import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';

export const PublisherFaultTypes = {
	/**
	 * A publisher is reporting trouble on its own send path **while** its subscribers report trouble
	 * receiving it. Both ends agree, so the source is implicated rather than inferred.
	 */
	corroboratedPublisherFault: 'CORROBORATED_PUBLISHER_FAULT',
} as const;

export type PublisherFaultCorroborationDetectorConfig = {

	/**
	 * Issue types raised by the **publishing** client about its own outbound path. **Required.**
	 *
	 * The natural set from client-monitor-js: `encoder-bottleneck`, `capture-bottleneck`,
	 * `dry-outbound-track`. All three mean "I am failing to produce or send this properly", which is
	 * the half of the story the receivers cannot see.
	 */
	publisherIssueTypes: string[];

	/**
	 * Issue types raised by the **subscribing** clients about the track they receive. **Required.**
	 *
	 * The natural set: `freezed-video-track`, `dry-inbound-track`, `video-recovery-failed`. These say
	 * "I am not getting this properly", which is the half the publisher cannot see.
	 */
	receiverIssueTypes: string[];

	/**
	 * Subscribers of the track that must be complaining at the same time. Default `2`.
	 *
	 * `1` still yields a genuine two-sided corroboration — publisher and one receiver agreeing is
	 * already more than either says alone — but `2` rules out the case where a single receiver's own
	 * downlink is at fault and merely coincides with the publisher's complaint. Sensible range `1`–`3`;
	 * higher mostly costs you findings in small calls, where a track may only have two subscribers.
	 */
	minAffectedReceivers: number;

	/**
	 * Re-arm time per published track (ms). Default `60_000`.
	 *
	 * Typical `30_000`–`300_000`. This detector raises the highest-confidence finding in the library,
	 * so it is the one you least want repeating every tick.
	 */
	cooldownMs: number;
};

/** The two-sided evidence behind one finding. */
export type CorroboratedPublisherFault = {
	trackId: string;
	kind: string;
	publisherClientId: string;

	/** The publisher's own open issue types on this track. */
	publisherIssueTypes: string[];

	/** The receiver-side open issue types across this track's subscribers. */
	receiverIssueTypes: string[];

	receivers: number;
	affectedReceivers: number;
	affectedClientIds: string[];
	publisherBitrate?: number;
};

/**
 * Fires only when **both ends of one published track are complaining at the same time**: the
 * publisher about its own send path, and its subscribers about receiving it.
 *
 * ### How this differs from `IssueFanOutDetector`
 *
 * Fan-out sees one end. It observes that most of Alice's subscribers are unhappy and *infers* that
 * the fault is on Alice's side, because the affected clients share a publisher and nothing else. That
 * inference is sound, and it is still a inference: the same observation is produced by the SFU
 * mangling Alice's stream on the way out, with Alice herself perfectly healthy.
 *
 * This detector removes the inference. When Alice reports `encoder-bottleneck` *and* four of her six
 * subscribers report `freezed-video-track` in the same window, there is nothing left to deduce — the
 * source said it was struggling and the receivers confirmed the consequence. That is the strongest
 * statement this library can make about where a fault sits, and it is only available to something
 * holding both ends at once. Neither the publisher nor any receiver can reach this conclusion alone.
 *
 * Run both: fan-out is broader and catches the SFU-forwarding case where the publisher is fine;
 * this one is narrower and, when it fires, needs no interpretation.
 *
 * ### Silence here is not health
 *
 * A quiet detector means only that the two halves have not coincided — most commonly because the
 * publisher is genuinely fine and the fault is in forwarding, which is exactly the case `fan-out`
 * exists to report. Do not read "no corroborated fault" as "no publisher-side problem".
 *
 * ```ts
 * observedCall.addDetector('publisher-fault-corroboration-detector', {
 *   publisherIssueTypes: [ 'encoder-bottleneck', 'capture-bottleneck', 'dry-outbound-track' ],
 *   receiverIssueTypes: [ 'freezed-video-track', 'dry-inbound-track' ],
 * });
 * ```
 *
 * ### Requires a `RemoteTrackResolver`
 *
 * Matching a publisher's issue to its subscribers' issues needs the publisher↔subscriber links. With
 * no resolver the detector does nothing rather than guessing.
 */
export class PublisherFaultCorroborationDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'publisher-fault-corroboration-detector' as const;

	public readonly name = PublisherFaultCorroborationDetector.NAME;

	private readonly _config: PublisherFaultCorroborationDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();

	/** Open publisher-side issues that name a track. */
	private readonly _publisherIssues = new Set<ActiveClientIssue>();

	/** Open receiver-side issues that name a track. */
	private readonly _receiverIssues = new Set<ActiveClientIssue>();

	/** The faults corroborated on the most recent `update()`. Exposed for tests/dashboards. */
	public lastFaults: CorroboratedPublisherFault[] = [];

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<PublisherFaultCorroborationDetectorConfig> = {},
	) {
		this._config = {
			publisherIssueTypes: [],
			receiverIssueTypes: [],
			minAffectedReceivers: 2,
			cooldownMs: 60_000,
			...config,
		};

		for (const type of this._config.publisherIssueTypes) {
			this._call.activeIssuesRegistry.addIssueTracker(type, this);
		}
		for (const type of this._config.receiverIssueTypes) {
			this._call.activeIssuesRegistry.addIssueTracker(type, this);
		}
	}

	public get size(): number {
		return this._publisherIssues.size + this._receiverIssues.size;
	}

	public has(issue: ActiveClientIssue): boolean {
		return this._publisherIssues.has(issue) || this._receiverIssues.has(issue);
	}

	public add(issue: ActiveClientIssue): void {
		// Without a `trackId` the issue cannot be attached to either end of a specific stream.
		if (issue.trackId === undefined) return;

		if (this._config.publisherIssueTypes.includes(issue.type)) this._publisherIssues.add(issue);
		else if (this._config.receiverIssueTypes.includes(issue.type)) this._receiverIssues.add(issue);
	}

	public delete(issue: ActiveClientIssue): boolean {
		return this._publisherIssues.delete(issue) || this._receiverIssues.delete(issue);
	}

	public clear(): void {
		this._publisherIssues.clear();
		this._receiverIssues.clear();
		this.lastFaults = [];
	}

	public update(): void {
		this.lastFaults = [];

		// Corroboration needs both halves. If either side is silent there is nothing to correlate, and
		// this is the common case — so it costs two `size` checks.
		if (this._publisherIssues.size === 0 || this._receiverIssues.size === 0) return;
		if (!this._call.remoteTrackResolver) return;

		const now = Date.now();
		// Start from the publisher side: it is the smaller set (one client per track, versus one per
		// subscriber) and it is the side that has to be present for a finding to exist at all.
		const suspects = new Map<ObservedOutboundTrack, Set<string>>();

		for (const issue of this._publisherIssues) {
			const publisher = this._outboundTrackOf(issue);

			if (!publisher) continue;

			const types = suspects.get(publisher) ?? new Set<string>();

			types.add(issue.type);
			suspects.set(publisher, types);
		}

		if (suspects.size === 0) return;

		// Index the receiver complaints by the inbound track they name, so each suspect's subscriber
		// set can be checked with a lookup per subscriber instead of a scan of every open issue.
		const receiverIssuesByTrackId = new Map<string, ActiveClientIssue[]>();

		for (const issue of this._receiverIssues) {
			const existing = receiverIssuesByTrackId.get(issue.trackId as string);

			if (existing) existing.push(issue);
			else receiverIssuesByTrackId.set(issue.trackId as string, [ issue ]);
		}

		for (const [ publisher, publisherIssueTypes ] of suspects) {
			const receivers = publisher.remoteInboundTracks;

			if (receivers.size === 0) continue;

			const affectedClientIds = new Set<string>();
			const receiverIssueTypes = new Set<string>();

			for (const receiver of receivers) {
				const issues = receiverIssuesByTrackId.get(receiver.id);

				if (!issues) continue;

				for (const issue of issues) {
					affectedClientIds.add(issue.clientId);
					receiverIssueTypes.add(issue.type);
				}
			}

			if (affectedClientIds.size < this._config.minAffectedReceivers) continue;

			const fault: CorroboratedPublisherFault = {
				trackId: publisher.id,
				kind: publisher.kind,
				publisherClientId: publisher.getPeerConnection().client.clientId,
				publisherIssueTypes: [ ...publisherIssueTypes ],
				receiverIssueTypes: [ ...receiverIssueTypes ],
				receivers: receivers.size,
				affectedReceivers: affectedClientIds.size,
				affectedClientIds: [ ...affectedClientIds ],
				publisherBitrate: publisher.bitrate,
			};

			this.lastFaults.push(fault);

			if (now - (this._lastRaisedAt.get(publisher.id) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(publisher.id, now);

			this._call.addIssue({
				type: PublisherFaultTypes.corroboratedPublisherFault,
				timestamp: now,
				conclusion: {
					faultDomain: 'published-track',
					summary: `${fault.publisherClientId} reports ${fault.publisherIssueTypes.join(', ')} on track ${fault.trackId} while ${fault.affectedReceivers} of ${fault.receivers} subscribers report ${fault.receiverIssueTypes.join(', ')} — both ends agree`,
					recommendation: 'the source is implicated, not inferred: check that publisher\'s capture, encoder and uplink before looking at the SFU or the receivers',
					// Higher than any single-ended finding: two independent parties, one conclusion.
					confidence: 0.9,
				},
				payload: { ...fault },
			});
		}
	}

	public close(): void {
		this._call.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	/**
	 * Resolve a publisher-side issue's `trackId` to the outbound track it is about.
	 *
	 * Looked up through the reporting client's own peer connections: the issue names its client, so
	 * the search is bounded by that client's transports rather than by the size of the call.
	 */
	private _outboundTrackOf(issue: ActiveClientIssue): ObservedOutboundTrack | undefined {
		const client = this._call.observedClients.get(issue.clientId);

		if (!client || issue.trackId === undefined) return undefined;

		for (const peerConnection of client.observedPeerConnections.values()) {
			const outboundTrack = peerConnection.observedOutboundTracks.get(issue.trackId);

			if (outboundTrack) return outboundTrack;
		}

		return undefined;
	}
}
