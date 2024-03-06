import { IceCandidatePair, IceLocalCandidate, IceRemoteCandidate } from '@observertc/sample-schemas-js';
import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { IceCandidatePairReport } from '@observertc/report-schemas-js';
import { CallMetaType, createCallMetaReport } from './common/callMetaReports';

export type ObservedICEEvents = {
	update: [],
	'new-local-candidate': [IceLocalCandidate],
	'new-remote-candidate': [IceRemoteCandidate],
	'new-selected-candidate-pair': [{
		localCandidate: IceLocalCandidate,
		remoteCandidate: IceRemoteCandidate,
	}],
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

	private readonly _localCandidates = new Map<string, IceLocalCandidate>();
	private readonly _remoteCandidates = new Map<string, IceLocalCandidate>();
	
	private _selectedLocalCandidateId?: string;
	private _selectedRemoteCandidateId?: string;
	private _updated = Date.now();
	private _stats?: IceCandidatePair;
	private _closed = false;
    
	private constructor(
		public readonly peerConnection: ObservedPeerConnection,
	) {
		super();
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

	public update(candidatePair: IceCandidatePair, timestamp: number) {

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
		};

		this.reports.addIceCandidatePairReport(report);

		if (!candidatePair.nominated) return;

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
				this.emit('new-selected-candidate-pair', {
					localCandidate,
					remoteCandidate,
				});
			}
		}

		this._updated = timestamp;
		this.emit('update');
	}
}