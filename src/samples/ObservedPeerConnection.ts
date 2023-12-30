import {
	IceCandidatePair,
	IceLocalCandidate,
	IceRemoteCandidate,
	InboundAudioTrack,
	InboundVideoTrack,
	OutboundAudioTrack,
	OutboundVideoTrack,
	PeerConnectionTransport,
} from '@observertc/sample-schemas-js';
import { ObservedClient } from './ObservedClient';
import { ObservedInboundAudioTrack, ObservedInboundAudioTrackBuilder } from './ObservedInboundAudioTrack';
import { ObservedInboundVideoTrack, ObservedInboundVideoTrackBuilder } from './ObservedInboundVideoTrack';
import { ObservedOutboundAudioTrack, ObservedOutboundAudioTrackBuilder } from './ObservedOutboundAudioTrack';
import { ObservedOutboundVideoTrack, ObservedOutboundVideoTrackBuilder } from './ObservedOutboundVideoTrack';

export interface ObservedPeerConnection {
	readonly client: ObservedClient;
	peerConnectionLabel?: string;
	readonly peerConnectionId: string;

	inboundAudioTracks(): IterableIterator<ObservedInboundAudioTrack>;
	inboundVideoTracks(): IterableIterator<ObservedInboundVideoTrack>;
	outboundAudioTracks(): IterableIterator<ObservedOutboundAudioTrack>;
	outboundVideoTracks(): IterableIterator<ObservedOutboundVideoTrack>;

	transportSamples(): IterableIterator<PeerConnectionTransport>;
	iceCandidatePairs(): IterableIterator<IceCandidatePair>;
	iceRemoteCandidates(): IterableIterator<IceRemoteCandidate>;
	iceLocalCandidates(): IterableIterator<IceLocalCandidate>;
}

export class ObservedPeerConnectionBuilder {
	private _inboundAudioTracks = new Map<string, ObservedInboundAudioTrackBuilder>();
	private _inboundVideoTracks = new Map<string, ObservedInboundVideoTrackBuilder>();
	private _outboundAudioTracks = new Map<string, ObservedOutboundAudioTrackBuilder>();
	private _outboundVideoTracks = new Map<string, ObservedOutboundVideoTrackBuilder>();
	private _transportSamples: PeerConnectionTransport[] = [];
	private _iceCandidatePairs: IceCandidatePair[] = [];
	private _iceRemoteCandidates: IceRemoteCandidate[] = [];
	private _iceLocalCandidates: IceLocalCandidate[] = [];
	private _peerConnectionLabel?: string;
	public constructor(
		private _config: Omit<
		ObservedPeerConnection,
		| keyof IterableIterator<ObservedPeerConnection>
		| 'client'
		| 'inboundAudioTracks'
		| 'inboundVideoTracks'
		| 'outboundAudioTracks'
		| 'outboundVideoTracks'
		| 'transportSamples'
		| 'iceCandidatePairs'
		| 'iceRemoteCandidates'
		| 'iceLocalCandidates'
		>
	) {}

	public set peerConnectionLabel(value: string) {
		this._peerConnectionLabel = value;
	}

	public addTransportSample(transportSample: PeerConnectionTransport) {
		this._transportSamples.push(transportSample);
	}

	public addInboundAudioTrack(inboundAudioTrackSample: InboundAudioTrack) {
		if (inboundAudioTrackSample.trackId) {
			const builder = this._getInboundAudioTrackBuilder(
				inboundAudioTrackSample.trackId,
				inboundAudioTrackSample.sfuStreamId,
				inboundAudioTrackSample.sfuSinkId
			);

			builder.addSample(inboundAudioTrackSample);
		}
	}

	public addIceCandidatePair(iceCandidatePair: IceCandidatePair) {
		this._iceCandidatePairs.push(iceCandidatePair);
	}
	public addIceRemoveCandidate(iceRemoteCandidate: IceRemoteCandidate) {
		this._iceRemoteCandidates.push(iceRemoteCandidate);
	}
	public addIceLocalCandidate(iceLocalCandidate: IceLocalCandidate) {
		this._iceLocalCandidates.push(iceLocalCandidate);
	}

	private _getInboundAudioTrackBuilder(trackId: string, sfuStreamId?: string, sfuSinkId?: string): ObservedInboundAudioTrackBuilder {
		let result = this._inboundAudioTracks.get(trackId);

		if (!result) {
			result = new ObservedInboundAudioTrackBuilder({
				trackId,
				sfuStreamId,
				sfuSinkId,
			});
			this._inboundAudioTracks.set(trackId, result);
		}
		
		return result;
	}

	public addOutboundAudioTrack(outboundAudioTrackSample: OutboundAudioTrack) {
		if (outboundAudioTrackSample.trackId) {
			const builder = this._getOutboundAudioTrackBuilder(
				outboundAudioTrackSample.trackId,
				outboundAudioTrackSample.sfuStreamId,
			);

			builder.addSample(outboundAudioTrackSample);
		}
	}

	private _getOutboundAudioTrackBuilder(trackId: string, sfuStreamId?: string): ObservedOutboundAudioTrackBuilder {
		let result = this._outboundAudioTracks.get(trackId);

		if (!result) {
			result = new ObservedOutboundAudioTrackBuilder({
				trackId,
				sfuStreamId
			});
			this._outboundAudioTracks.set(trackId, result);
		}
		
		return result;
	}

	public addInboundVideoTrack(inboundVideoTrackSample: InboundVideoTrack) {
		if (inboundVideoTrackSample.trackId) {
			const builder = this._getInboundVideoTrackBuilder(
				inboundVideoTrackSample.trackId,
				inboundVideoTrackSample.sfuStreamId,
				inboundVideoTrackSample.sfuSinkId,
			);

			builder.addSample(inboundVideoTrackSample);
		}
	}

	private _getInboundVideoTrackBuilder(trackId: string, sfuStreamId?: string, sfuSinkId?: string): ObservedInboundVideoTrackBuilder {
		let result = this._inboundVideoTracks.get(trackId);

		if (!result) {
			result = new ObservedInboundVideoTrackBuilder({
				trackId,
				sfuStreamId,
				sfuSinkId,
			});
			this._inboundVideoTracks.set(trackId, result);
		}
		
		return result;
	}

	public addOutboundVideoTrack(outboundVideoTrackSample: OutboundVideoTrack) {
		if (outboundVideoTrackSample.trackId) {
			const builder = this._getOutboundVideoTrackBuilder(
				outboundVideoTrackSample.trackId,
				outboundVideoTrackSample.sfuStreamId,
			);

			builder.addSample(outboundVideoTrackSample);
		}
	}

	private _getOutboundVideoTrackBuilder(trackId: string, sfuStreamId?: string): ObservedOutboundVideoTrackBuilder {
		let result = this._outboundVideoTracks.get(trackId);

		if (!result) {
			result = new ObservedOutboundVideoTrackBuilder({
				trackId,
				sfuStreamId,
			});
			this._outboundVideoTracks.set(trackId, result);
		}
		
		return result;
	}

	public build(client: ObservedClient): ObservedPeerConnection {
		const inboundAudioTracks = new Map<string, ObservedInboundAudioTrack>();
		const outboundAudioTracks = new Map<string, ObservedOutboundAudioTrack>();
		const inboundVideoTracks = new Map<string, ObservedInboundVideoTrack>();
		const outboundVideoTracks = new Map<string, ObservedOutboundVideoTrack>();

		const result: ObservedPeerConnection = {
			client,
			...this._config,
			transportSamples: () => this._transportSamples.values(),
			iceCandidatePairs: () => this._iceCandidatePairs.values(),
			iceLocalCandidates: () => this._iceLocalCandidates.values(),
			iceRemoteCandidates: () => this._iceRemoteCandidates.values(),

			inboundAudioTracks: () => inboundAudioTracks.values(),
			outboundAudioTracks: () => outboundAudioTracks.values(),
			inboundVideoTracks: () => inboundVideoTracks.values(),
			outboundVideoTracks: () => outboundVideoTracks.values(),
		};

		for (const builder of this._inboundAudioTracks.values()) {
			const observedInboundAudioTrack = builder.build(result);

			inboundAudioTracks.set(observedInboundAudioTrack.trackId, observedInboundAudioTrack);
		}

		for (const builder of this._outboundAudioTracks.values()) {
			const observedOutboundAudioTrack = builder.build(result);

			outboundAudioTracks.set(observedOutboundAudioTrack.trackId, observedOutboundAudioTrack);
		}

		for (const builder of this._inboundVideoTracks.values()) {
			const observedInboundVideoTrack = builder.build(result);

			inboundVideoTracks.set(observedInboundVideoTrack.trackId, observedInboundVideoTrack);
		}

		for (const builder of this._outboundVideoTracks.values()) {
			const observedOutboundVideoTrack = builder.build(result);

			outboundVideoTracks.set(observedOutboundVideoTrack.trackId, observedOutboundVideoTrack);
		}

		return result;
	}
}
