import { CalculatedScore } from './scores/CalculatedScore';
import { MediaKind } from './common/types';
import { InboundTrackSample } from './schema/ClientSample';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';

export class ObservedInboundTrack implements InboundTrackSample {
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public appData?: Record<string, unknown>;
	public remoteOutboundTrack?: ObservedOutboundTrack | undefined;

	private _visited = false;

	public addedAt?: number | undefined;
	public removedAt?: number | undefined;

	public muted?: boolean;
	public attachments?: Record<string, unknown> | undefined;

	public degradationReasons: string[] = [];

	public get degraded() {
		return this.degradationReasons.length > 0;
	}

	constructor(
		public timestamp: number,
		public readonly id: string,
		public readonly kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
		private readonly _inboundRtp?: ObservedInboundRtp,
		private readonly _mediaPlayout?: ObservedMediaPlayout,
	) {
		// no-op
	}

	public get score() {
		return this.calculatedScore.value;
	}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	public getInboundRtp() {
		return this._inboundRtp;
	}

	public getMediaPlayout() {
		return this._mediaPlayout;
	}

	public update(stats: InboundTrackSample): void {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.calculatedScore.value = stats.score;
		this.attachments = stats.attachments;

		this.checkDegradation();
	}

	private checkDegradation() {
		const thresholds = this._peerConnection.client.call.observer.config.inboundTrackDegradationThresholds;

		this.degradationReasons.length = 0;
		if (!thresholds) return;

		const reasons: string[] = [];

		if (thresholds.deltaFreezeCount < (this._inboundRtp?.deltaFreezeCount ?? 0)) {
			reasons.push('freezes');
		}
		if (thresholds.framesDroppedRatio < (this._inboundRtp?.framesDroppedRatio ?? 0)) {
			reasons.push('frames-dropped');
		}
		if (thresholds.jitterBufferDelayInMs < (this._inboundRtp?.jitterBufferDelayInMs ?? 0)) {
			reasons.push('jitter-buffer-delay');
		}
		if (thresholds.concealmentRatio < (this._inboundRtp?.concealmentRatio ?? 0)) {
			reasons.push('concealment');
		}
		if (thresholds.rttInMs < (this._inboundRtp?.remoteRttInMs ?? 0)) {
			reasons.push('rtt');
		}

		this.degradationReasons = reasons;
	}
}