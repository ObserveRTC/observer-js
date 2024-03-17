import { EventEmitter } from 'events';
import { ObservedPeerConnection } from '../ObservedPeerConnection';
import { ObservedICEEvents } from '../ObservedICE';

export type TurnUsageMonitorEvents = {
	close: [],
	'newturnip': [string],
	update: [TurnUsage],
	addpeerconnection: [ObservedPeerConnection],
	removepeerconnection: [ObservedPeerConnection],
}

export type TurnUsage = {
	turnIp: string;
	totalBytesSent: number;
	totalBytesReceived: number;
	totalPacketsSent: number;
	totalPacketsReceived: number;
}

type ObservedConnection = {
	peerConnection: ObservedPeerConnection,
	onUpdate: (...e: ObservedICEEvents['update']) => void;

}

export declare interface TurnUsageMonitor {
	on<U extends keyof TurnUsageMonitorEvents>(event: U, listener: (...args: TurnUsageMonitorEvents[U]) => void): this;
	off<U extends keyof TurnUsageMonitorEvents>(event: U, listener: (...args: TurnUsageMonitorEvents[U]) => void): this;
	once<U extends keyof TurnUsageMonitorEvents>(event: U, listener: (...args: TurnUsageMonitorEvents[U]) => void): this;
	emit<U extends keyof TurnUsageMonitorEvents>(event: U, ...args: TurnUsageMonitorEvents[U]): boolean;
}

export class TurnUsageMonitor extends EventEmitter {
	private readonly _connections = new Map<string, ObservedConnection>();
	private readonly _turnUsage = new Map<string, TurnUsage>();

	private _closed = false;
	public constructor() {
		super();
	}

	public addPeerConnection(peerConnection: ObservedPeerConnection) {
		if (this.closed) return;
		if (this._connections.has(peerConnection.peerConnectionId)) return;

		const ice = peerConnection.ICE;

		const onUpdate = () => {
			const turnIp = ice?.selectedRemoteCandidate?.address;
			
			if (!peerConnection.usingTURN || !turnIp) return;
			
			let usage = this._turnUsage.get(turnIp);

			if (!usage) {
				usage = {
					turnIp,
					totalBytesSent: 0,
					totalBytesReceived: 0,
					totalPacketsSent: 0,
					totalPacketsReceived: 0,
				};
				this._turnUsage.set(turnIp, usage);

				this.emit('newturnip', turnIp);
			}
			
			usage.totalBytesSent += ice.deltaBytesSent;
			usage.totalBytesReceived += ice.deltaBytesReceived;
			usage.totalPacketsSent += ice.deltaPacketsSent;
			usage.totalPacketsReceived += ice.deltaPacketsReceived;

			this.emit('update', usage);
		};

		peerConnection.ICE.on('update', onUpdate);

		this._connections.set(peerConnection.peerConnectionId, {
			peerConnection,
			onUpdate
		});

		this.emit('addpeerconnection', peerConnection);
	}

	public removePeerConnection(peerConnection: ObservedPeerConnection) {
		if (this.closed) return;
		if (!this._connections.has(peerConnection.peerConnectionId)) return;

		const { onUpdate } = this._connections.get(peerConnection.peerConnectionId) ?? {};
		
		if (!onUpdate) return;

		peerConnection.ICE.off('update', onUpdate);

		this._connections.delete(peerConnection.peerConnectionId);

		this.emit('removepeerconnection', peerConnection);
	}

	public get turnIps() {
		return Array.from(this._turnUsage.keys());
	}

	public get peerConnections() {
		return Array.from(this._connections.values()).map(({ peerConnection }) => peerConnection);
	}

	public getUsage(turnIp: string) {
		return this._turnUsage.get(turnIp);
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		this.emit('close');
	}
}