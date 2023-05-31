import { InboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedPeerConnection } from './ObservedPeerConnection';

export interface ObservedInboundVideoTrack {
	readonly peerConnection: ObservedPeerConnection;
	readonly trackId: string;
	readonly sfuStreamId?: string,
	readonly sfuSinkId?: string,
	
	samples(): IterableIterator<InboundVideoTrack>;
}

export class ObservedInboundVideoTrackBuilder {
	private _trackSamples: InboundVideoTrack[] = [];

	public constructor(
		private _config: Omit<
			ObservedInboundVideoTrack,
			keyof IterableIterator<ObservedPeerConnection> | 'peerConnection' | 'samples'
		>
	) {}

	public addSample(inboundVideoTrack: InboundVideoTrack) {
		this._trackSamples.push(inboundVideoTrack);
	}

	public build(peerConnection: ObservedPeerConnection): ObservedInboundVideoTrack {
		const result: ObservedInboundVideoTrack = {
			peerConnection,
			...this._config,
			samples: () => this._trackSamples.values(),
		};
		return result;
	}
}
