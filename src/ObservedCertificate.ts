import { ObservedPeerConnection } from './ObservedPeerConnection';
import { CertificateStats } from './schema/ClientSample';

export class ObservedCertificate implements CertificateStats {
	public appData?: Record<string, unknown>;

	private _visited = false;

	fingerprint?: string;
	fingerprintAlgorithm?: string;
	base64Certificate?: string;
	issuerCertificateId?: string;
	attachments?: Record<string, unknown>;

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

	public update(stats: CertificateStats) {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.fingerprint = stats.fingerprint;
		this.fingerprintAlgorithm = stats.fingerprintAlgorithm;
		this.base64Certificate = stats.base64Certificate;
		this.issuerCertificateId = stats.issuerCertificateId;
		this.attachments = stats.attachments;
	}
}
