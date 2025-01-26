import { ObservedPeerConnection } from './ObservedPeerConnection';
import { DataChannelStats } from './schema/ClientSample';

export type ObservedDataChannelState = 'connecting' | 'open' | 'closing' | 'closed';

export class ObservedDataChannel implements DataChannelStats	{
	private _visited = false;
	
	label?: string | undefined;
	protocol?: string | undefined;
	dataChannelIdentifier?: number | undefined;
	state?: string | undefined;
	messagesSent?: number | undefined;
	bytesSent?: number | undefined;
	messagesReceived?: number | undefined;
	bytesReceived?: number | undefined;
	attachments?: Record<string, unknown> | undefined;

	public appData?: Record<string, unknown>;

	public constructor(
		public timestamp: number,
		public id: string,
		private readonly _peerConnection: ObservedPeerConnection,
	) {
	}

	public get visited() {
		const visited = this._visited;
	
		this._visited = false;
	
		return visited;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	public update(stats: DataChannelStats) {
		this._visited = true;

		this.label = stats.label;
		this.protocol = stats.protocol;
		this.dataChannelIdentifier = stats.dataChannelIdentifier;
		this.state = stats.state;
		this.messagesSent = stats.messagesSent;
		this.bytesSent = stats.bytesSent;
		this.messagesReceived = stats.messagesReceived;
		this.bytesReceived = stats.bytesReceived;
		this.attachments = stats.attachments;
	}
}
