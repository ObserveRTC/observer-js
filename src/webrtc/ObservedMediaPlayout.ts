import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { MediaPlayoutStats } from '../schema/ClientSample';

export class ObservedMediaPlayout implements MediaPlayoutStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	synthesizedSamplesDuration?: number | undefined;
	synthesizedSamplesEvents?: number | undefined;
	totalSamplesDuration?: number | undefined;
	totalPlayoutDelay?: number | undefined;
	totalSamplesCount?: number | undefined;
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

	

	public update(stats: MediaPlayoutStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.synthesizedSamplesDuration = stats.synthesizedSamplesDuration;
		this.synthesizedSamplesEvents = stats.synthesizedSamplesEvents;
		this.totalSamplesDuration = stats.totalSamplesDuration;
		this.totalPlayoutDelay = stats.totalPlayoutDelay;
		this.totalSamplesCount = stats.totalSamplesCount;
		this.attachments = stats.attachments;
		
	}
}
