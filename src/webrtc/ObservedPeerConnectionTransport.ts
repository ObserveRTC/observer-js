import { ObservedPeerConnection } from './ObservedPeerConnection';
import { PeerConnectionTransportStats } from '../schema/ClientSample';

export class ObservedPeerConnectionTransport implements PeerConnectionTransportStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	dataChannelsOpened?: number | undefined;
	dataChannelsClosed?: number | undefined;
	attachments?: Record<string, unknown> | undefined;

	public constructor(
		public timestamp: number,
		public id: string,
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

	public update(stats: PeerConnectionTransportStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.dataChannelsOpened = stats.dataChannelsOpened;
		this.dataChannelsClosed = stats.dataChannelsClosed;
		this.attachments = stats.attachments;
	}
}
