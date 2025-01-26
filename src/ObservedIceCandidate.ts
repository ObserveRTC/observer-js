import { ObservedPeerConnection } from './ObservedPeerConnection';
import { IceCandidateStats } from './schema/ClientSample';

export class ObservedIceCandidate implements IceCandidateStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	transportId?: string | undefined;
	address?: string | undefined;
	port?: number | undefined;
	protocol?: string | undefined;
	candidateType?: string | undefined;
	priority?: number | undefined;
	url?: string | undefined;
	relayProtocol?: string | undefined;
	foundation?: string | undefined;
	relatedAddress?: string | undefined;
	relatedPort?: number | undefined;
	usernameFragment?: string | undefined;
	tcpType?: string | undefined;
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

	public getIceTransport() {
		return this._peerConnection.observedIceTransports.get(this.transportId ?? '');
	}

	public update(stats: IceCandidateStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.address = stats.address;
		this.port = stats.port;
		this.protocol = stats.protocol;
		this.candidateType = stats.candidateType;
		this.priority = stats.priority;
		this.url = stats.url;
		this.relayProtocol = stats.relayProtocol;
		this.foundation = stats.foundation;
		this.relatedAddress = stats.relatedAddress;
		this.relatedPort = stats.relatedPort;
		this.usernameFragment = stats.usernameFragment;
		this.tcpType = stats.tcpType;
		this.attachments = stats.attachments;
	}
}
