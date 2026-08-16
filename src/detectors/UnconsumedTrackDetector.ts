import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';

export const UnconsumedTrackTypes = {
	/** A track is being published to the SFU that nobody is subscribed to — pure wasted uplink. */
	unconsumedPublishedTrack: 'UNCONSUMED_PUBLISHED_TRACK',
} as const;

export type UnconsumedTrackDetectorConfig = {

	/** How long a track must stay unconsumed while sending before reporting (ms). Default `30_000`. */
	minUnconsumedDurationInMs: number;

	/** Ignore tracks below this bitrate — a trickle isn't worth an alert (bps). Default `50_000`. */
	minBitrate: number;

	/** Re-arm time (ms) per track. Default `300_000`. */
	cooldownMs: number;
};

/**
 * Finds tracks that are **published but consumed by nobody** — uplink and SFU ingress spent on media
 * that is never forwarded anywhere.
 *
 * This is the one detector that reads the resolver's *silence* as the signal: an outbound track with
 * an empty `remoteInboundTracks` set, still pushing packets. It reads `call.unconsumedOutboundTracks`,
 * which the resolver maintains as tracks gain and lose subscribers, so a healthy call costs one
 * `size === 0` check rather than a walk over every published track. The usual causes are a participant
 * publishing while everyone has them hidden or muted-in-UI, a simulcast layer no viewer's bandwidth
 * ever selects, or an application that forgot to stop a track after the last subscriber left.
 *
 * It is deliberately slow to fire: `minUnconsumedDurationInMs` must elapse with the track still
 * sending, because a brief gap between publishing and the first subscription is completely normal at
 * join time.
 *
 * ### Careful: this detector is only sound with a resolver
 *
 * "No subscribers" and "no resolver configured" produce the identical observation — an empty link
 * set. Without a `RemoteTrackResolver` this would report *every* published track in the call as
 * unconsumed, so it checks `call.remoteTrackResolver` at runtime and does nothing without one.
 */
export class UnconsumedTrackDetector implements Detector {
	public static readonly NAME = 'unconsumed-track-detector';
	public readonly name = UnconsumedTrackDetector.NAME;

	public readonly config: UnconsumedTrackDetectorConfig;

	/** trackId -> when it was first seen sending with no subscribers. */
	private readonly _unconsumedSince = new Map<string, number>();
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly call: ObservedCall,
		config: Partial<UnconsumedTrackDetectorConfig> = {},
	) {
		this.config = {
			cooldownMs: 300_000,
			minUnconsumedDurationInMs: 30_000,
			minBitrate: 50_000,
			...config,
		};
	}

	public update(): void {
		// Without links, "no subscribers" is unknowable — never guess.
		if (!this.call.remoteTrackResolver) return;

		const unconsumed = this.call.unconsumedOutboundTracks;

		// The common case: every published track has a subscriber, so there is nothing to look at.
		// The set is maintained by the resolver at the two moments the answer can change (a track
		// gains its first subscriber, or loses its last), so this costs nothing on a healthy call
		// rather than a walk over every published track in it.
		if (unconsumed.size === 0) {
			if (0 < this._unconsumedSince.size) this._unconsumedSince.clear();

			return;
		}

		const now = Date.now();
		const seen = new Set<string>();

		for (const outboundTrack of unconsumed) {
			const rtps = outboundTrack.getOutboundRtps() ?? [];
			let bitrate = 0;
			let sending = false;

			for (let i = 0; i < rtps.length; i++) {
				bitrate += rtps[i].bitrate;
				if (0 < rtps[i].deltaPacketsSent) sending = true;
			}

			seen.add(outboundTrack.id);

			if (!sending || bitrate < this.config.minBitrate) {
				this._unconsumedSince.delete(outboundTrack.id);
				continue;
			}

			const since = this._unconsumedSince.get(outboundTrack.id) ?? now;

			this._unconsumedSince.set(outboundTrack.id, since);

			const unconsumedForMs = now - since;

			if (unconsumedForMs < this.config.minUnconsumedDurationInMs) continue;
			if (now - (this._lastRaisedAt.get(outboundTrack.id) ?? 0) < this.config.cooldownMs) continue;

			this._lastRaisedAt.set(outboundTrack.id, now);

			const peerConnection = outboundTrack.getPeerConnection();

			this.call.addIssue({
				type: UnconsumedTrackTypes.unconsumedPublishedTrack,
				timestamp: now,
				payload: {
					trackId: outboundTrack.id,
					kind: outboundTrack.kind,
					publisherClientId: peerConnection?.client.clientId,
					peerConnectionId: peerConnection?.peerConnectionId,
					bitrate,
					unconsumedForMs,
					// what the waste costs, roughly, if it continues
					wastedBytesPerSecond: bitrate / 8,
				},
			});
		}

		for (const trackId of [ ...this._unconsumedSince.keys() ]) {
			if (!seen.has(trackId)) this._unconsumedSince.delete(trackId);
		}
	}

	public close(): void {
		this._unconsumedSince.clear();
		this._lastRaisedAt.clear();
	}
}
