import { CalculatedScore } from './scores/CalculatedScore';
import { MediaKind } from './common/types';
import { InboundTrackSample } from './schema/ClientSample';
import { Detectors } from './detectors/Detectors';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';

export class ObservedInboundTrack implements InboundTrackSample {
	public readonly detectors: Detectors;
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public appData?: Record<string, unknown>;

	private _visited = false;

	attachments?: Record<string, unknown> | undefined;

	constructor(
		public timestamp: number,
		public readonly id: string,
		public readonly kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
		private readonly _inboundRtp?: ObservedInboundRtp,
		private readonly _mediaPlayout?: ObservedMediaPlayout,
	) {
		this.detectors = new Detectors();
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

	public getRemoteOutboundTrack() {
		return this._peerConnection.client.call.remoteTrackResolver?.resolveRemoteOutboundTrack(this);
	}

	public update(stats: InboundTrackSample): void {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.calculatedScore.value = stats.score;
		this.attachments = stats.attachments;
	
		this.detectors.update();
	}
	
}