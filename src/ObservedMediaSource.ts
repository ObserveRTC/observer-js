import { MediaKind } from './common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { MediaSourceStats } from './schema/ClientSample';
import { counterDelta, rmsAudioLevel } from './utils/stats';

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

	/** Increase of `totalAudioEnergy` in this tick (audio only). */
	public deltaTotalAudioEnergy = 0;

	/** Increase of `totalSamplesDuration` in this tick, in seconds (audio only). */
	public deltaTotalSamplesDuration = 0;

	/**
	 * RMS level (0..1) of what the capture device delivered over the tick, after the browser's own
	 * processing (AEC, NS, AGC). Chrome and Safari report the inputs; Firefox does not, and there the
	 * publisher's level has to come from its receivers — see `ObservedOutboundTrack.rmsAudioLevel`.
	 */
	public rmsAudioLevel?: number;

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

		this.deltaTotalAudioEnergy = 0;
		this.deltaTotalSamplesDuration = 0;
		this.rmsAudioLevel = undefined;

		if (this.timestamp < stats.timestamp) {
			this.deltaTotalAudioEnergy = counterDelta(this.totalAudioEnergy, stats.totalAudioEnergy);
			this.deltaTotalSamplesDuration = counterDelta(this.totalSamplesDuration, stats.totalSamplesDuration);
			this.rmsAudioLevel = rmsAudioLevel(this.deltaTotalAudioEnergy, this.deltaTotalSamplesDuration);
		}

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
