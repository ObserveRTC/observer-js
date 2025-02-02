import { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedTURN } from './ObservedTURN';

export class ObservedTurnServer {
	public totalBytesSent = 0;
	public totalBytesReceived = 0;
	public totalPacketsSent = 0;
	public totalPacketsReceived = 0;

	public packetsSentPerSecond = 0;
	public packetsReceivedPerSecond = 0;
	public outboundBitrate = 0;
	public inboundBitrate = 0;

	public deltaBytesSent = 0;
	public deltaBytesReceived = 0;
	public deltaPacketsSent = 0;
	public deltaPacketsReceived = 0;
    
	public readonly observedPeerConnections = new Map<string, ObservedPeerConnection>(); 

	public updated = Date.now();

	public constructor(
		public readonly url: string,
		public readonly observedTURN: ObservedTURN,
	) {

	}

	public updateTurnUsage(...selectedcandidatepairs: ObservedIceCandidatePair[]) {
		for (const selectedcandidatepair of selectedcandidatepairs) {
			this.deltaBytesReceived += selectedcandidatepair.deltaBytesReceived;
			this.deltaBytesSent += selectedcandidatepair.deltaBytesSent;
			this.deltaPacketsReceived += selectedcandidatepair.deltaPacketsReceived;
			this.deltaPacketsSent += selectedcandidatepair.deltaPacketsSent;
		}
	}

	public update() {
		const now = Date.now();
		const deltaInS = (now - this.updated) / 1000;
        
		this.packetsSentPerSecond = this.deltaPacketsSent / deltaInS;
		this.packetsReceivedPerSecond = this.deltaPacketsReceived / deltaInS;   
		this.outboundBitrate = (this.deltaBytesReceived * 8) / deltaInS;
		this.inboundBitrate = (this.deltaBytesSent * 8) / deltaInS;
        
		this.totalBytesSent += this.deltaBytesSent;
		this.totalBytesReceived += this.deltaBytesReceived;
		this.totalPacketsSent += this.deltaPacketsSent;
		this.totalPacketsReceived += this.deltaPacketsReceived;
		
		this.observedTURN.totalBytesSent += this.deltaBytesSent;
		this.observedTURN.totalBytesReceived += this.deltaBytesReceived;
		this.observedTURN.totalPacketsSent += this.deltaPacketsSent;
		this.observedTURN.totalPacketsReceived += this.deltaPacketsReceived;
        
		this.observedTURN.inboundBitrate += this.inboundBitrate;
		this.observedTURN.outboundBitrate += this.outboundBitrate;
		this.observedTURN.packetsReceivedPerSecond += this.packetsReceivedPerSecond;
		this.observedTURN.packetsSentPerSecond += this.packetsSentPerSecond;
        
		this.deltaBytesSent = 0;
		this.deltaBytesReceived = 0;
		this.deltaPacketsSent = 0;
		this.deltaPacketsReceived = 0;

		this.updated = now;
	}
}