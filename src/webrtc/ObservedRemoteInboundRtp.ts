import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { RemoteInboundRtpStats } from '../schema/ClientSample';

export class ObservedRemoteInboundRtp implements RemoteInboundRtpStats {
	private _visited = false;
	public appData?: Record<string, unknown>;
	transportId?: string | undefined;
	codecId?: string | undefined;
	packetsReceived?: number | undefined;
	packetsLost?: number | undefined;
	jitter?: number | undefined;
	localId?: string | undefined;
	roundTripTime?: number | undefined;
	totalRoundTripTime?: number | undefined;
	fractionLost?: number | undefined;
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

	public getOutboundRtp() {
		return this._peerConnection.observedOutboundRtps.get(this.ssrc);
	}

	public getCodec() {
		return this._peerConnection.observedCodecs.get(this.codecId ?? '');
	}

	public update(stats: RemoteInboundRtpStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.codecId = stats.codecId;
		this.packetsReceived = stats.packetsReceived;
		this.packetsLost = stats.packetsLost;
		this.jitter = stats.jitter;
		this.localId = stats.localId;
		this.roundTripTime = stats.roundTripTime;
		this.totalRoundTripTime = stats.totalRoundTripTime;
		this.fractionLost = stats.fractionLost;
		this.roundTripTimeMeasurements = stats.roundTripTimeMeasurements;
		this.attachments = stats.attachments;
	}
}
