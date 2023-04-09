import { OutboundAudioTrack } from "@observertc/sample-schemas-js";
import { ObservedPeerConnection } from "./ObservedPeerConnection";

export interface ObservedOutboundAudioTrack {
    readonly peerConnection: ObservedPeerConnection;
    readonly trackId: string;

    samples(): IterableIterator<OutboundAudioTrack>;
}

export class ObservedOutboundAudioTrackBuilder {
    private _trackSamples: OutboundAudioTrack[] = [];

    public constructor(
        private _config: Omit<ObservedOutboundAudioTrack,
            | keyof IterableIterator<ObservedPeerConnection>
            | 'peerConnection'
            | 'samples'
        >
    ) {
    }

    public addSample(outboundAudioTrack: OutboundAudioTrack) {
        this._trackSamples.push(outboundAudioTrack);
    }

    public build(peerConnection: ObservedPeerConnection): ObservedOutboundAudioTrack {
        const result: ObservedOutboundAudioTrack = {
            peerConnection,
            ...this._config,
            samples: () => this._trackSamples.values(),
        };
        return result;
    }
}
