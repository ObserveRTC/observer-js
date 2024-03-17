import { IceCandidatePair, IceLocalCandidate, IceRemoteCandidate } from '@observertc/sample-schemas-js';
import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { IceCandidatePairReport } from '@observertc/report-schemas-js';
import { CallMetaType, createCallMetaReport } from './common/callMetaReports';

export type ObservedICEEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	'new-local-candidate': [IceLocalCandidate],
	'new-remote-candidate': [IceRemoteCandidate],
	'new-selected-candidate-pair': [{
		localCandidate: IceLocalCandidate,
		remoteCandidate: IceRemoteCandidate,
	}],
	usingturnchanged: [boolean],
	close: [],
};

export declare interface ObservedICE {
	on<U extends keyof ObservedICEEvents>(event: U, listener: (...args: ObservedICEEvents[U]) => void): this;
	off<U extends keyof ObservedICEEvents>(event: U, listener: (...args: ObservedICEEvents[U]) => void): this;
	once<U extends keyof ObservedICEEvents>(event: U, listener: (...args: ObservedICEEvents[U]) => void): this;
	emit<U extends keyof ObservedICEEvents>(event: U, ...args: ObservedICEEvents[U]): boolean;
}

export class ObservedICE extends EventEmitter {
	public static create(peerConnection: ObservedPeerConnection,) {
		return new ObservedICE(peerConnection);
	}

	public marker?: string;

	private readonly _localCandidates = new Map<string, IceLocalCandidate>();
	private readonly _remoteCandidates = new Map<string, IceLocalCandidate>();
	
	public usingTURN = false;

	public deltaBytesReceived = 0;
	public deltaBytesSent = 0;
	public deltaPacketsReceived = 0;
	public deltaPacketsSent = 0;

	public totalBytesReceived = 0;
	public totalBytesSent = 0;
	public totalPacketsReceived = 0;
	public totalPacketsSent = 0;

	public currentRttInMs?: number;

	private _selectedLocalCandidateId?: string;
	private _selectedRemoteCandidateId?: string;
	private _updated = Date.now();
	private _stats?: IceCandidatePair;
	private _closed = false;
    
	private constructor(
		public readonly peerConnection: ObservedPeerConnection,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public get localCandidates(): ReadonlyMap<string, IceLocalCandidate> {
		return this._localCandidates;
	}

	public get remoteCandidates(): ReadonlyMap<string, IceRemoteCandidate> {
		return this._remoteCandidates;
	}

	public get selectedLocalCandidate() {
		return this._localCandidates.get(this._selectedLocalCandidateId ?? '');
	}

	public get selectedRemoteCandidate() {
		return this._remoteCandidates.get(this._selectedRemoteCandidateId ?? '');
	}

	public get stats() {
		return this._stats;
	}

	public get updated() {
		return this._updated;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;
		this.emit('close');
	}

	public addLocalCandidate(candidate: IceLocalCandidate) {
		if (!candidate.id) return;

		const newCandidate = !this._localCandidates.has(candidate.id);

		this._localCandidates.set(candidate.id, candidate);

		if (newCandidate) {
			const callMetaReport = createCallMetaReport(
				this.peerConnection.client.serviceId, 
				this.peerConnection.client.mediaUnitId, 
				this.peerConnection.client.roomId, 
				this.peerConnection.client.callId, 
				this.peerConnection.client.clientId, {
					type: CallMetaType.ICE_LOCAL_CANDIDATE,
					payload: candidate,
				}, this.peerConnection.client.userId);

			this.reports.addCallMetaReport(callMetaReport);

			this.emit('new-local-candidate', candidate);
		}
	}

	public addRemoteCandidate(candidate: IceRemoteCandidate) {
		if (!candidate.id) return;

		const newCandidate = !this._remoteCandidates.has(candidate.id);

		this._remoteCandidates.set(candidate.id, candidate);

		if (newCandidate) {
			const callMetaReport = createCallMetaReport(
				this.peerConnection.client.serviceId, 
				this.peerConnection.client.mediaUnitId, 
				this.peerConnection.client.roomId, 
				this.peerConnection.client.callId, 
				this.peerConnection.client.clientId, {
					type: CallMetaType.ICE_REMOTE_CANDIDATE,
					payload: candidate,
				}, this.peerConnection.client.userId);

			this.reports.addCallMetaReport(callMetaReport);
            
			this.emit('new-remote-candidate', candidate);
		}
	}

	public resetMetrics() {
		this.deltaBytesReceived = 0;
		this.deltaBytesSent = 0;
		this.deltaPacketsReceived = 0;
		this.deltaPacketsSent = 0;

		this.currentRttInMs = undefined;
	}

	public update(candidatePair: IceCandidatePair, timestamp: number) {
		const now = Date.now();
		const elapsedTimeInMs = now - this._updated;
		const report: IceCandidatePairReport = {
			serviceId: this.peerConnection.client.serviceId,
			mediaUnitId: this.peerConnection.client.mediaUnitId,
			roomId: this.peerConnection.client.roomId,
			callId: this.peerConnection.client.callId,
			clientId: this.peerConnection.client.clientId,
			userId: this.peerConnection.client.userId,
			timestamp,
			...candidatePair,
			sampleSeq: -1, // deprecated
			marker: this.marker,
		};

		this.reports.addIceCandidatePairReport(report);

		if (!candidatePair.nominated) return;
		
		this.deltaBytesReceived = (candidatePair.bytesReceived ?? 0) - (this._stats?.bytesReceived ?? 0);
		this.deltaBytesSent = (candidatePair.bytesSent ?? 0) - (this._stats?.bytesSent ?? 0);
		this.deltaPacketsReceived = (candidatePair.packetsReceived ?? 0) - (this._stats?.packetsReceived ?? 0);
		this.deltaPacketsSent = (candidatePair.packetsSent ?? 0) - (this._stats?.packetsSent ?? 0);
		
		this.totalBytesReceived += this.deltaBytesReceived;
		this.totalBytesSent += this.deltaBytesSent;
		this.totalPacketsReceived += this.deltaPacketsReceived;
		this.totalPacketsSent += this.deltaPacketsSent;
		
		this.currentRttInMs = candidatePair.currentRoundTripTime ? candidatePair.currentRoundTripTime * 1000 : undefined;

		this._stats = candidatePair;

		if (
			candidatePair.localCandidateId && 
            candidatePair.localCandidateId !== this._selectedLocalCandidateId && 
            this._localCandidates.has(candidatePair.localCandidateId) &&
            candidatePair.remoteCandidateId &&
            candidatePair.remoteCandidateId !== this._selectedRemoteCandidateId &&
            this._remoteCandidates.has(candidatePair.remoteCandidateId)
		) {
			this._selectedLocalCandidateId = candidatePair.localCandidateId;
			this._selectedRemoteCandidateId = candidatePair.remoteCandidateId;

			const localCandidate = this._localCandidates.get(candidatePair.localCandidateId);
			const remoteCandidate = this._remoteCandidates.get(candidatePair.remoteCandidateId);

			if (localCandidate && remoteCandidate) {
				const wasUsingTURN = this.usingTURN;

				this.usingTURN = remoteCandidate.candidateType?.toLocaleLowerCase() === 'relay';

				this.emit('new-selected-candidate-pair', {
					localCandidate,
					remoteCandidate,
				});

				if (wasUsingTURN !== this.usingTURN) {
					this.emit('usingturnchanged', this.usingTURN);
				}
			}
		}

		this._updated = now;
		this.emit('update', {
			elapsedTimeInMs,
		});
	}
}