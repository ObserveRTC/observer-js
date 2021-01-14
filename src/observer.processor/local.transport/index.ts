import type {
    PeerConnectionSample
} from '../../schema/v20200114'

export interface LocalTransport {
    onObserverRTCSample?: (sampleList?: PeerConnectionSample[]) => void;
}
