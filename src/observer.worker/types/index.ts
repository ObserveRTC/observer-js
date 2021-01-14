import type {
    RawStats, UserMediaErrorPayload
} from '../../observer.collector/rtc.collector'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'


type RequestRawStats = 'requestRawStats'
type OnRequestRawStats = 'onRequestRawStats'
type RequestInitialConfig = 'requestInitialConfig'
type OnRequestInitialConfig = 'onRequestInitialConfig'
type OnUserMediaError = 'onUserMediaError'
type OnLocalTransport = 'onLocalTransport'

type Data = RawStats[] | InitialConfig | UserMediaErrorPayload

// Default transport will be remote ( websocket )
export type TransportType = 'local' | 'remote'

export interface InitialConfig {
    wsAddress: string;
    poolingIntervalInMs: number;
    transportType: TransportType;
}

export interface ClientPayload {
    what: OnRequestRawStats | OnRequestInitialConfig | OnUserMediaError;
    data: Data;
}

export interface WorkerPayload {
    what: RequestRawStats | RequestInitialConfig | OnLocalTransport;
    data?: PeerConnectionSample[];
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onRequestInitialConfig: () => void;
    onTransportCallback: (peerConnectionSamples?: PeerConnectionSample[]) => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: (rawStats: RawStats[]) => void;
    onResponseInitialConfig: (rawStats: InitialConfig) => void;
    onUserMediaError: (mediaError: UserMediaErrorPayload) => void;
}
