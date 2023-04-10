import { InboundAudioTrack } from '@observertc/sample-schemas-js';
import { ObservedPeerConnection } from './ObservedPeerConnection';

export interface ObservedInboundAudioTrack {
	readonly peerConnection: ObservedPeerConnection;
	readonly trackId: string;

	samples(): IterableIterator<InboundAudioTrack>;
}

export class ObservedInboundAudioTrackBuilder {
	private _trackSamples: InboundAudioTrack[] = [];
	public constructor(
		private _config: Omit<
			ObservedInboundAudioTrack,
			keyof IterableIterator<ObservedPeerConnection> | 'peerConnection' | 'samples'
		>
	) {}

	public addSample(inboundAudioTrack: InboundAudioTrack) {
		this._trackSamples.push(inboundAudioTrack);
	}

	public build(peerConnection: ObservedPeerConnection): ObservedInboundAudioTrack {
		const result: ObservedInboundAudioTrack = {
			peerConnection,
			...this._config,
			samples: () => this._trackSamples.values(),
		};
		return result;
	}
}
