import { ObservedPeerConnection } from './ObservedPeerConnection';
import { CodecStats } from '../schema/ClientSample';

export class ObservedCodec implements CodecStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	payloadType?: number | undefined;
	transportId?: string | undefined;
	clockRate?: number | undefined;
	channels?: number | undefined;
	sdpFmtpLine?: string | undefined;
	attachments?: Record<string, unknown> | undefined;

	public constructor(
		public timestamp: number,
		public id: string,
		public mimeType: string,
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

	public update(stats: CodecStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.payloadType = stats.payloadType;
		this.transportId = stats.transportId;
		this.clockRate = stats.clockRate;
		this.channels = stats.channels;
		this.sdpFmtpLine = stats.sdpFmtpLine;
		this.attachments = stats.attachments;
	}
}
