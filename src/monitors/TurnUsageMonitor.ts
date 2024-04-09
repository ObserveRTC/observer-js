import { EventEmitter } from 'events';
import { ObservedPeerConnection } from '../ObservedPeerConnection';
import { ObservedICEEvents } from '../ObservedICE';
import { ObservedClient } from '../ObservedClient';

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

export type TurnStats = {
	turnIp: string;
	totalBytesSent: number;
	totalBytesReceived: number;
	totalPacketsSent: number;
	totalPacketsReceived: number;
	deltaBytesSent: number;
	deltaBytesReceived: number;
	timestamp: number;
	outboundBitrate: number;
	inboundBitrate: number;
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
	private readonly _stats = new Map<string, TurnStats>();

	private _closed = false;
	public constructor() {
		super();
		this.setMaxListeners(Infinity);
	}

	public getStats(): TurnStats[] {
		const result: TurnStats[] = [];

		for (const [ turnIp, usage ] of this._turnUsage) {
			const stats = this._stats.get(turnIp) ?? {
				turnIp,
				totalBytesSent: 0,
				totalBytesReceived: 0,
				totalPacketsSent: 0,
				totalPacketsReceived: 0,
				deltaBytesSent: 0,
				deltaBytesReceived: 0,
				timestamp: Date.now(),
				outboundBitrate: 0,
				inboundBitrate: 0,
			};

			stats.deltaBytesSent = usage.totalBytesSent - stats.totalBytesSent;
			stats.deltaBytesReceived = usage.totalBytesReceived - stats.totalBytesReceived;
			stats.timestamp = Date.now();
			stats.outboundBitrate = (stats.deltaBytesSent * 8) / ((stats.timestamp - stats.timestamp) / 1000.0);
			stats.inboundBitrate = (stats.deltaBytesReceived * 8) / ((stats.timestamp - stats.timestamp) / 1000.0);
			stats.totalBytesSent = usage.totalBytesSent;
			stats.totalBytesReceived = usage.totalBytesReceived;
			stats.totalPacketsSent = usage.totalPacketsSent;
			stats.totalPacketsReceived = usage.totalPacketsReceived;

			this._stats.set(turnIp, stats);

			result.push(stats);
		}

		return result;
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

	public get clients(): ReadonlyMap<string, ObservedClient> {
		const result = new Map<string, ObservedClient>();

		for (const pc of this.peerConnections) {
			if (result.has(pc.clientId)) continue;
			
			result.set(pc.clientId, pc.client);
		}

		return result;
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