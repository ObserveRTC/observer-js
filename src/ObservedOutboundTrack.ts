import { CalculatedScore } from './scores/CalculatedScore';
import { MediaKind } from './common/types';
import { OutboundTrackSample } from './schema/ClientSample';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedOutboundRtp } from './ObservedOutboundRtp';
import { ObservedMediaSource } from './ObservedMediaSource';
import { ObservedInboundTrack } from './ObservedInboundTrack';

export class ObservedOutboundTrack implements OutboundTrackSample {
	private _visited = false;
	public appData?: Record<string, unknown>;

	public readonly remoteInboundTracks = new Set<ObservedInboundTrack>();
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};

	public addedAt?: number | undefined;
	public removedAt?: number | undefined;

	public muted?: boolean;

	attachments?: Record<string, unknown> | undefined;

	constructor(
		public timestamp: number,
		public readonly id: string,
		public readonly kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
		private readonly _outboundRtps?: ObservedOutboundRtp[],
		private readonly _mediaSource?: ObservedMediaSource,
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

	public getOutboundRtps() {
		return this._outboundRtps;
	}

	public getMediaSource() {
		return this._mediaSource;
	}

	public update(stats: OutboundTrackSample): void {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.calculatedScore.value = stats.score;
		this.attachments = stats.attachments;
	}
}