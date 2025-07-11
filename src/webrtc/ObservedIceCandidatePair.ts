import { ObservedPeerConnection } from './ObservedPeerConnection';
import { IceCandidatePairStats } from '../schema/ClientSample';

export class ObservedIceCandidatePair implements IceCandidatePairStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	transportId?: string | undefined;
	localCandidateId?: string | undefined;
	remoteCandidateId?: string | undefined;
	state?: 'new' | 'in-progress' | 'waiting' | 'failed' | 'succeeded' | undefined;
	nominated?: boolean | undefined;
	packetsSent?: number | undefined;
	packetsReceived?: number | undefined;
	bytesSent?: number | undefined;
	bytesReceived?: number | undefined;
	lastPacketSentTimestamp?: number | undefined;
	lastPacketReceivedTimestamp?: number | undefined;
	totalRoundTripTime?: number | undefined;
	currentRoundTripTime?: number | undefined;
	availableOutgoingBitrate?: number | undefined;
	availableIncomingBitrate?: number | undefined;
	requestsReceived?: number | undefined;
	requestsSent?: number | undefined;
	responsesReceived?: number | undefined;
	responsesSent?: number | undefined;
	consentRequestsSent?: number | undefined;
	packetsDiscardedOnSend?: number | undefined;
	bytesDiscardedOnSend?: number | undefined;
	attachments?: Record<string, unknown> | undefined;

	public deltaBytesSent = 0;
	public deltaBytesReceived = 0;
	public deltaPacketsSent = 0;
	public deltaPacketsReceived = 0;

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

	public getIceTransport() {
		return this._peerConnection.observedIceTransports.get(this.transportId ?? '');
	}

	public getLocalCandidate() {
		return this._peerConnection.observedIceCandidates.get(this.localCandidateId ?? '');
	}

	public getRemoteCandidate() {
		return this._peerConnection.observedIceCandidates.get(this.remoteCandidateId ?? '');
	}

	public update(stats: IceCandidatePairStats) {
		this._visited = true;

		if (this.packetsSent && stats.packetsSent && stats.packetsSent >= this.packetsSent) {
			this.deltaPacketsSent = stats.packetsSent - this.packetsSent;
		} else {
			this.deltaPacketsSent = 0;
		}
		if (this.packetsReceived && stats.packetsReceived && stats.packetsReceived >= this.packetsReceived) {
			this.deltaPacketsReceived = stats.packetsReceived - this.packetsReceived;
		} else {
			this.deltaPacketsReceived = 0;
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

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.localCandidateId = stats.localCandidateId;
		this.remoteCandidateId = stats.remoteCandidateId;
		this.state = this._convertState(stats.state);
		this.nominated = stats.nominated;
		this.packetsSent = stats.packetsSent;
		this.packetsReceived = stats.packetsReceived;
		this.bytesSent = stats.bytesSent;
		this.bytesReceived = stats.bytesReceived;
		this.lastPacketSentTimestamp = stats.lastPacketSentTimestamp;
		this.lastPacketReceivedTimestamp = stats.lastPacketReceivedTimestamp;
		this.totalRoundTripTime = stats.totalRoundTripTime;
		this.currentRoundTripTime = stats.currentRoundTripTime;
		this.availableOutgoingBitrate = stats.availableOutgoingBitrate;
		this.availableIncomingBitrate = stats.availableIncomingBitrate;
		this.requestsReceived = stats.requestsReceived;
		this.requestsSent = stats.requestsSent;
		this.responsesReceived = stats.responsesReceived;
		this.responsesSent = stats.responsesSent;
		this.consentRequestsSent = stats.consentRequestsSent;
		this.packetsDiscardedOnSend = stats.packetsDiscardedOnSend;
		this.bytesDiscardedOnSend = stats.bytesDiscardedOnSend;
		this.attachments = stats.attachments;
	}

	private _convertState(state: string | undefined) {
		switch (state) {
			case 'new':
			case 'in-progress':
			case 'waiting':
			case 'failed':
			case 'succeeded':
				return state;
			case 'cancelled':
				return 'failed';
			case 'inprogress':
				return 'in-progress';
			default:
				return undefined;
		}
	}
}