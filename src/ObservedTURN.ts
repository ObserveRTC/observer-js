import { EventEmitter } from 'stream';
import { ObservedPeerConnection } from './webrtc/ObservedPeerConnection';
import { ObservedTurnServer } from './ObservedTurnServer';
import { createLogger } from './common/logger';

const logger = createLogger('ObservedTURN');

export type ObservedTURNEventMap = {
	'update': [ObservedTURN];
	'close': [];
}

export declare interface ObservedTURN {
	on<U extends keyof ObservedTURNEventMap>(event: U, listener: (...args: ObservedTURNEventMap[U]) => void): this;
	off<U extends keyof ObservedTURNEventMap>(event: U, listener: (...args: ObservedTURNEventMap[U]) => void): this;
	once<U extends keyof ObservedTURNEventMap>(event: U, listener: (...args: ObservedTURNEventMap[U]) => void): this;
	emit<U extends keyof ObservedTURNEventMap>(event: U, ...args: ObservedTURNEventMap[U]): boolean;
}

export class ObservedTURN extends EventEmitter {
	public totalBytesSent = 0;
	public totalBytesReceived = 0;
	public totalPacketsSent = 0;
	public totalPacketsReceived = 0;

	public packetsSentPerSecond = 0;
	public packetsReceivedPerSecond = 0;
	public outboundBitrate = 0;
	public inboundBitrate = 0;
	public numberOfClients = 0;
    
	public readonly servers = new Map<string, ObservedTurnServer>();

	public constructor(
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public update() {
		const clientIds = new Set<string>();
        
		this.packetsReceivedPerSecond = 0;
		this.packetsSentPerSecond = 0;
		this.outboundBitrate = 0;
		this.inboundBitrate = 0;

		for (const server of this.servers.values()) {
			server.update();
			server.observedPeerConnections.forEach((pc) => clientIds.add(pc.client.clientId));
		}

		this.numberOfClients = clientIds.size;
	}

	public addPeerConnection(peerConnection: ObservedPeerConnection) {
		const turnPairs = peerConnection.selectedIceCandidatePairs.filter((pair) => pair.getLocalCandidate()?.candidateType === 'relay' && pair.getRemoteCandidate()?.url?.startsWith('turn:'));

		if (turnPairs.length !== 1) {
			return (logger.warn(`Expected exactly one TURN pair, but found for peerconnection ${peerConnection.peerConnectionId}`, turnPairs.length), undefined);
		}

		const candidatePair = turnPairs[0];
		const rawUrl = candidatePair.getRemoteCandidate()?.url;

		if (!rawUrl) {
			return (logger.warn(`No remote candidate URL found for peerconnection ${peerConnection.peerConnectionId}`), undefined);
		}

		const turnUrl = new URL(rawUrl);
		const turnServerUrl = `${turnUrl.protocol}//${turnUrl.hostname}:${turnUrl.port}`;
		let turnServer = this.servers.get(turnServerUrl);
        
		if (!turnServer) {
			turnServer = new ObservedTurnServer(turnServerUrl, this);
		}

		return turnServer;
	}

	public removePeerConnection(peerConnection: ObservedPeerConnection) {
		for (const turnServer of this.servers.values()) {
			turnServer.observedPeerConnections.delete(peerConnection.peerConnectionId);
		}
	}

}