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

	public addedAt?: number | undefined;
	public removedAt?: number | undefined;
	
	public deltaBytesSent = 0;
	public deltaBytesReceived = 0;
	public deltaMessagesSent = 0;
	public deltaMessagesReceived = 0;

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

		if (this.messagesSent && stats.messagesSent && stats.messagesSent >= this.messagesSent) {
			this.deltaMessagesSent = stats.messagesSent - this.messagesSent;
		} else {
			this.deltaMessagesSent = 0;
		}

		if (this.messagesReceived && stats.messagesReceived && stats.messagesReceived >= this.messagesReceived) {
			this.deltaMessagesReceived = stats.messagesReceived - this.messagesReceived;
		} else {
			this.deltaMessagesReceived = 0;
		}

		if (this.bytesSent && stats.bytesSent && stats.bytesSent >= this.bytesSent) {
			this.deltaBytesSent = stats.bytesSent - this.bytesSent;
		} else {
			this.deltaBytesSent = 0;
		}

		if (this.bytesReceived && stats.bytesReceived && stats.bytesReceived >= this.bytesReceived) {
			this.deltaBytesReceived = stats.bytesReceived - this.bytesReceived;
		} else {
			this.deltaBytesReceived = 0;
		}

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
