import { ObservedPeerConnection } from './ObservedPeerConnection';
import { IceTransportStats } from './schema/ClientSample';

export class ObservedIceTransport implements IceTransportStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	packetsSent?: number | undefined;
	packetsReceived?: number | undefined;
	bytesSent?: number | undefined;
	bytesReceived?: number | undefined;
	iceRole?: string | undefined;
	iceLocalUsernameFragment?: string | undefined;
	dtlsState?: string | undefined;
	iceState?: string | undefined;
	selectedCandidatePairId?: string | undefined;
	localCertificateId?: string | undefined;
	remoteCertificateId?: string | undefined;
	tlsVersion?: string | undefined;
	dtlsCipher?: string | undefined;
	dtlsRole?: string | undefined;
	srtpCipher?: string | undefined;
	selectedCandidatePairChanges?: number | undefined;
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

	public getSelectedCandidatePair() {
		return this._peerConnection.observedIceCandidatesPair.get(this.selectedCandidatePairId ?? '');
	}

	public update(stats: IceTransportStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.packetsSent = stats.packetsSent;
		this.packetsReceived = stats.packetsReceived;
		this.bytesSent = stats.bytesSent;
		this.bytesReceived = stats.bytesReceived;
		this.iceRole = stats.iceRole;
		this.iceLocalUsernameFragment = stats.iceLocalUsernameFragment;
		this.dtlsState = stats.dtlsState;
		this.iceState = stats.iceState;
		this.selectedCandidatePairId = stats.selectedCandidatePairId;
		this.localCertificateId = stats.localCertificateId;
		this.remoteCertificateId = stats.remoteCertificateId;
		this.tlsVersion = stats.tlsVersion;
		this.dtlsCipher = stats.dtlsCipher;
		this.dtlsRole = stats.dtlsRole;
		this.srtpCipher = stats.srtpCipher;
		this.selectedCandidatePairChanges = stats.selectedCandidatePairChanges;
		this.attachments = stats.attachments;
	}
}
