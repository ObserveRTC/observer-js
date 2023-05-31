import { OutboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedPeerConnection } from './ObservedPeerConnection';

export interface ObservedOutboundVideoTrack {
	readonly peerConnection: ObservedPeerConnection;
	readonly trackId: string;
	readonly sfuStreamId?: string,
	
	samples(): IterableIterator<OutboundVideoTrack>;
}

export class ObservedOutboundVideoTrackBuilder {
	private _trackSamples: OutboundVideoTrack[] = [];

	public constructor(
		private _config: Omit<
			ObservedOutboundVideoTrack,
			keyof IterableIterator<ObservedPeerConnection> | 'peerConnection' | 'samples'
		>
	) {}

	public addSample(outboundVideoTrack: OutboundVideoTrack) {
		this._trackSamples.push(outboundVideoTrack);
	}

	public build(peerConnection: ObservedPeerConnection): ObservedOutboundVideoTrack {
		const result: ObservedOutboundVideoTrack = {
			peerConnection,
			...this._config,
			samples: () => this._trackSamples.values(),
		};
		return result;
	}
}
