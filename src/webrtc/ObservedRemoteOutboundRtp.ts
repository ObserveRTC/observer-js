import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { RemoteOutboundRtpStats } from '../schema/ClientSample';

export class ObservedRemoteOutboundRtp implements RemoteOutboundRtpStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	transportId?: string | undefined;
	codecId?: string | undefined;
	packetsSent?: number | undefined;
	bytesSent?: number | undefined;
	localId?: string | undefined;
	remoteTimestamp?: number | undefined;
	reportsSent?: number | undefined;
	roundTripTime?: number | undefined;
	totalRoundTripTime?: number | undefined;
	roundTripTimeMeasurements?: number | undefined;
	attachments?: Record<string, unknown> | undefined;

	public constructor(
		public timestamp: number,
		public id: string,
		public ssrc: number,
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

	public getInboundRtp() {
		return this._peerConnection.observedInboundRtps.get(this.ssrc);
	}

	public getCodec() {
		return this._peerConnection.observedCodecs.get(this.codecId ?? '');
	}

	public update(stats: RemoteOutboundRtpStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.codecId = stats.codecId;
		this.packetsSent = stats.packetsSent;
		this.bytesSent = stats.bytesSent;
		this.localId = stats.localId;
		this.remoteTimestamp = stats.remoteTimestamp;
		this.reportsSent = stats.reportsSent;
		this.roundTripTime = stats.roundTripTime;
		this.totalRoundTripTime = stats.totalRoundTripTime;
		this.roundTripTimeMeasurements = stats.roundTripTimeMeasurements;
		this.attachments = stats.attachments;
	}
}
