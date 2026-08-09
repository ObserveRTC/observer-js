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

const defaultConfig: UnconsumedTrackDetectorConfig = {
	minUnconsumedDurationInMs: 30_000,
	minBitrate: 50_000,
	cooldownMs: 300_000,
};

/**
 * Finds tracks that are **published but consumed by nobody** — uplink and SFU ingress spent on media
 * that is never forwarded anywhere.
 *
 * This is the one detector that reads the resolver's *silence* as the signal: an outbound track with
 * an empty `remoteInboundTracks` set, still pushing packets. The usual causes are a participant
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
	public readonly name = 'unconsumed-track-detector';

	private readonly _config: UnconsumedTrackDetectorConfig;

	/** trackId -> when it was first seen sending with no subscribers. */
	private readonly _unconsumedSince = new Map<string, number>();
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<UnconsumedTrackDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
	}

	public update(): void {
		// Without links, "no subscribers" is unknowable — never guess.
		if (!this._call.remoteTrackResolver) return;

		const now = Date.now();
		const seen = new Set<string>();

		for (const client of this._call.observedClients.values()) {
			for (const peerConnection of client.observedPeerConnections.values()) {
				for (const outboundTrack of peerConnection.observedOutboundTracks.values()) {
					const rtps = outboundTrack.getOutboundRtps() ?? [];
					const bitrate = rtps.reduce((sum, rtp) => sum + rtp.bitrate, 0);
					const sending = rtps.some((rtp) => 0 < rtp.deltaPacketsSent);
					const consumed = 0 < outboundTrack.remoteInboundTracks.size;

					seen.add(outboundTrack.id);

					if (consumed || !sending || bitrate < this._config.minBitrate) {
						this._unconsumedSince.delete(outboundTrack.id);
						continue;
					}

					const since = this._unconsumedSince.get(outboundTrack.id) ?? now;

					this._unconsumedSince.set(outboundTrack.id, since);

					const unconsumedForMs = now - since;

					if (unconsumedForMs < this._config.minUnconsumedDurationInMs) continue;
					if (now - (this._lastRaisedAt.get(outboundTrack.id) ?? 0) < this._config.cooldownMs) continue;

					this._lastRaisedAt.set(outboundTrack.id, now);

					this._call.addIssue({
						type: UnconsumedTrackTypes.unconsumedPublishedTrack,
						timestamp: now,
						payload: JSON.stringify({
							type: UnconsumedTrackTypes.unconsumedPublishedTrack,
							trackId: outboundTrack.id,
							kind: outboundTrack.kind,
							publisherClientId: client.clientId,
							peerConnectionId: peerConnection.peerConnectionId,
							bitrate,
							unconsumedForMs,
							// what the waste costs, roughly, if it continues
							wastedBytesPerSecond: bitrate / 8,
						}),
					});
				}
			}
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
