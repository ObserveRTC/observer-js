import { ClientSample } from "@observertc/sample-schemas-js";
import { ObservedPeerConnection, ObservedPeerConnectionBuilder } from "./ObservedPeerConnection";
import { ObservedCall } from "./ObservedCall";

export interface ObservedClient {
	readonly call: ObservedCall;

	readonly clientId: string;
	readonly mediaUnitId: string;

	observedPeerConnections(): IterableIterator<ObservedPeerConnection>;
	getObservedPeerConnection(peerConnectionid: string): ObservedPeerConnection | undefined;
	samples(): IterableIterator<ClientSample>;

	readonly marker?: string;
	readonly userId?: string;
	readonly timeZoneId?: string;

	minTimestamp: number,
	maxTimestamp: number;
}

export class ObservedClientBuilder {
	
	private _minTimestamp?: number;
	private _maxTimestamp?: number;
	private _peerConnections = new Map<string, ObservedPeerConnectionBuilder>();
	private _clientSamples: ClientSample[] = [];
	public constructor(
		private _config: Omit<ObservedClient, 
			| keyof IterableIterator<ObservedPeerConnection>
			| 'samples'
			| 'call'
			| 'getObservedPeerConnection'
			| 'observedPeerConnections'
			| 'minTimestamp'
			| 'maxTimestamp'
		>
	) {
		
	}

	public addClientSample(clientSample: ClientSample) {
		
		this._clientSamples.push(clientSample);

		if (clientSample.pcTransports) {
			for (const pcTransport of clientSample.pcTransports) {
				const builder = this._getOrCreatePcBuilder(pcTransport.peerConnectionId);
				builder.addTransportSample(pcTransport);
				if (pcTransport.label) {
					builder.peerConnectionLabel = pcTransport.label;
				}
			}
		}
		if (clientSample.iceLocalCandidates) {
			for (const iceLocalCandidate of clientSample.iceLocalCandidates) {
				if (!iceLocalCandidate.peerConnectionId) {
					continue;
				}
				const builder = this._getOrCreatePcBuilder(iceLocalCandidate.peerConnectionId);
				builder.addIceLocalCandidate(iceLocalCandidate);
			}
		}
		if (clientSample.iceRemoteCandidates) {
			for (const iceRemoteCandidate of clientSample.iceRemoteCandidates) {
				if (!iceRemoteCandidate.peerConnectionId) {
					continue;
				}
				const builder = this._getOrCreatePcBuilder(iceRemoteCandidate.peerConnectionId);
				builder.addIceRemoveCandidate(iceRemoteCandidate);
			}
		}
		if (clientSample.iceCandidatePairs) {
			for (const iceCandidatePair of clientSample.iceCandidatePairs) {
				const builder = this._getOrCreatePcBuilder(iceCandidatePair.peerConnectionId);
				builder.addIceCandidatePair(iceCandidatePair);
			}
		}
		if (clientSample.inboundAudioTracks) {
			for (const trackSample of clientSample.inboundAudioTracks) {
				const { trackId, peerConnectionId } = trackSample;
				if (!trackId || !peerConnectionId) 
					continue;
				
				const builder = this._getOrCreatePcBuilder(peerConnectionId);
				builder.addInboundAudioTrack(trackSample);
			}
		}

		if (clientSample.inboundVideoTracks) {
			for (const trackSample of clientSample.inboundVideoTracks) {
				const { trackId, peerConnectionId } = trackSample;
				if (!trackId || !peerConnectionId)
					continue;
	
				const builder = this._getOrCreatePcBuilder(peerConnectionId);
				builder.addInboundVideoTrack(trackSample);
			}
		}
	
		if (clientSample.outboundAudioTracks) {
			for (const trackSample of clientSample.outboundAudioTracks) {
				const { trackId, peerConnectionId } = trackSample;
				if (!trackId || !peerConnectionId)
					continue;
	
				const builder = this._getOrCreatePcBuilder(peerConnectionId);
				builder.addOutboundAudioTrack(trackSample);
			}
		}
	
		if (clientSample.outboundVideoTracks) {
			for (const trackSample of clientSample.outboundVideoTracks) {
				const { trackId, peerConnectionId } = trackSample;
				if (!trackId || !peerConnectionId)
					continue;
	
				const builder = this._getOrCreatePcBuilder(peerConnectionId);
				builder.addOutboundVideoTrack(trackSample);
			}
		}

		if (this._minTimestamp === undefined || clientSample.timestamp < this._minTimestamp) {
			this._minTimestamp = clientSample.timestamp;
		}
		
		if (this._maxTimestamp === undefined || this._maxTimestamp < clientSample.timestamp) {
			this._maxTimestamp = clientSample.timestamp;
		}
	}

	private _getOrCreatePcBuilder(peerConnectionId: string): ObservedPeerConnectionBuilder {
		let result = this._peerConnections.get(peerConnectionId);
		if (!result) {
			result = new ObservedPeerConnectionBuilder({
				peerConnectionId,
			});
			this._peerConnections.set(peerConnectionId, result);
		}
		return result;
	}

	public build(call: ObservedCall): ObservedClient {
		const observedPeerConnections = new Map<string, ObservedPeerConnection>();

		const result: ObservedClient = {
			call,
			...this._config,
			minTimestamp: this._minTimestamp ?? Date.now(),
			maxTimestamp: this._maxTimestamp ?? Date.now(),
			samples: () => this._clientSamples.values(),
			observedPeerConnections: () => observedPeerConnections.values(),
			getObservedPeerConnection: (pcId: string) => observedPeerConnections.get(pcId),
		};

		for (const builder of this._peerConnections.values()) {
			const observedPeerConnection = builder.build(result);
			observedPeerConnections.set(observedPeerConnection.peerConnectionId, observedPeerConnection);
		}
		return result;
	}
}