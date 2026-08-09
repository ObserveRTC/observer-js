import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ObserverEvents } from '../ObserverEvents';
import { SlidingWindow } from '../utils/stats';

export const IceDisruptionTypes = {
	/** Many participants lost/failed their ICE connection inside the same window. */
	callIceDisruption: 'CALL_ICE_DISRUPTION',
} as const;

export type IceDisruptionDetectorConfig = {

	/** Minimum participants before a ratio is meaningful. Default `3`. */
	minClients: number;

	/** Fraction of participants that must be disrupted within the window. Default `0.5`. */
	affectedRatioThreshold: number;

	/** Correlation window (ms). Default `10_000`. */
	windowMs: number;

	/** Re-arm time (ms) before raising again. Default `60_000`. */
	cooldownMs: number;
};

const defaultConfig: IceDisruptionDetectorConfig = {
	minClients: 3,
	affectedRatioThreshold: 0.5,
	windowMs: 10_000,
	cooldownMs: 60_000,
};

/** The transitions treated as a disruption. */
const disruptedStates = new Set([ 'disconnected', 'failed' ]);

/**
 * Detects an **ICE disruption storm**: many participants of a call losing connectivity inside the
 * same short window.
 *
 * One client losing ICE is routine (they walked out of Wi-Fi range). Twenty-eight of thirty-five
 * doing it within five seconds is an infrastructure event, and that conclusion is only reachable by
 * correlating clients — which is the whole point of doing it here rather than in the browser.
 *
 * ### Prefer the issue-driven path
 *
 * This detector works from **raw ICE state transitions**, which is the fallback for clients that do
 * not report issues. If your clients run client-monitor-js >= 4.6.0, prefer
 * `ConcurrentIssueDetector` configured with the ICE issue types instead:
 *
 * ```ts
 * new ConcurrentIssueDetector(observedCall, {
 *   issueTypes: [ 'ice-disconnected', 'ice-connection-failed', 'ice-transport-stalled', 'unstable-ice-path' ],
 * });
 * ```
 *
 * The client's own detector is better at deciding *whether* a transport is really disrupted: it
 * raises `ice-disconnected` only once `disconnected` has persisted past a threshold, so the transient
 * blips ICE routinely heals on its own never produce an issue at all, and it distinguishes a terminal
 * `failed` from a stalled transport from an unstable path. This detector cannot make those
 * distinctions — a raw `disconnected` that recovers in 200 ms looks identical to one that never does.
 * It also gains resolution intervals, so "they all recovered together" becomes observable.
 *
 * ### Why this one subscribes to the bus
 *
 * ICE transitions are discrete events that can occur and revert between two `update()` ticks;
 * polling `iceConnectionState` per tick would miss short flaps. It therefore implements `close()`
 * to drop its listeners (called automatically when the call closes or the detector is removed).
 */
export class IceDisruptionDetector implements Detector {
	public readonly name = 'ice-disruption-detector';

	private readonly _config: IceDisruptionDetectorConfig;

	/** clientId -> the last time that client was seen disrupted, inside the window. */
	private readonly _disruptions: SlidingWindow<string>;
	private _lastRaisedAt = 0;
	private readonly _onIceStateChanged: (payload: ObserverEvents['ice-connection-state-changed'][0]) => void;
	private readonly _onConnectionStateChanged: (payload: ObserverEvents['connection-state-changed'][0]) => void;

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<IceDisruptionDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._disruptions = new SlidingWindow<string>(this._config.windowMs);

		const record = ({ observedCall, observedClient, state }: { observedCall: ObservedCall, observedClient: { clientId: string }, state: string }) => {
			// The bus is observer-wide; only take events belonging to our call.
			if (observedCall !== this._call) return;
			if (!disruptedStates.has(state)) return;

			this._disruptions.add(observedClient.clientId);
		};

		this._onIceStateChanged = record;
		this._onConnectionStateChanged = record;

		_call.observer.on('ice-connection-state-changed', this._onIceStateChanged);
		_call.observer.on('connection-state-changed', this._onConnectionStateChanged);
	}

	public update(): void {
		const now = Date.now();
		const affected = new Set(this._disruptions.values(now));
		const numberOfClients = this._call.observedClients.size;

		if (numberOfClients < this._config.minClients) return;
		if (affected.size === 0) return;

		const affectedRatio = affected.size / numberOfClients;

		if (affectedRatio < this._config.affectedRatioThreshold) return;
		if (now - this._lastRaisedAt < this._config.cooldownMs) return;

		this._lastRaisedAt = now;

		this._call.addIssue({
			type: IceDisruptionTypes.callIceDisruption,
			timestamp: now,
			payload: JSON.stringify({
				type: IceDisruptionTypes.callIceDisruption,
				callId: this._call.callId,
				clients: numberOfClients,
				affectedClients: affected.size,
				affectedRatio,
				affectedClientIds: [ ...affected ],
				windowMs: this._config.windowMs,
			}),
		});
	}

	public close(): void {
		this._call.observer.off('ice-connection-state-changed', this._onIceStateChanged);
		this._call.observer.off('connection-state-changed', this._onConnectionStateChanged);
		this._disruptions.clear();
	}
}
