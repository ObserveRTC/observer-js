import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { MediaSourceStats } from '../schema/ClientSample';

export class ObservedMediaSource implements MediaSourceStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	trackIdentifier?: string | undefined;
	audioLevel?: number | undefined;
	totalAudioEnergy?: number | undefined;
	totalSamplesDuration?: number | undefined;
	echoReturnLoss?: number | undefined;
	echoReturnLossEnhancement?: number | undefined;
	width?: number | undefined;
	height?: number | undefined;
	frames?: number | undefined;
	framesPerSecond?: number | undefined;
	attachments?: Record<string, unknown> | undefined;

	public constructor(
		public timestamp: number,
		public id: string,
		public kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection
	) {}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	public getTrack() {
		return this._peerConnection.observedOutboundTracks.get(this.trackIdentifier ?? '');
	}

	public update(stats: MediaSourceStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.trackIdentifier = stats.trackIdentifier;
		this.audioLevel = stats.audioLevel;
		this.totalAudioEnergy = stats.totalAudioEnergy;
		this.totalSamplesDuration = stats.totalSamplesDuration;
		this.echoReturnLoss = stats.echoReturnLoss;
		this.echoReturnLossEnhancement = stats.echoReturnLossEnhancement;
		this.width = stats.width;
		this.height = stats.height;
		this.frames = stats.frames;
		this.framesPerSecond = stats.framesPerSecond;
		this.attachments = stats.attachments;
	}
}
