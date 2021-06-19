import type {
    ExtensionStatsPayload,
    RawStats,
    UserMediaErrorPayload
} from '../../observer.collector/rtc.collector'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'


type RequestRawStats = 'requestRawStats'
type OnRequestRawStats = 'onRequestRawStats'
type RequestInitialConfig = 'requestInitialConfig'
type OnRequestInitialConfig = 'onRequestInitialConfig'
type OnUserMediaError = 'onUserMediaError'
type OnExtensionStats = 'onExtensionStats'
type OnLocalTransport = 'onLocalTransport'
type RequestAccessToken = 'requestAccessToken'
type OnRequestAccessToken = 'onRequestAccessToken'

type Data = ExtensionStatsPayload | InitialConfig | RawStats[] | UserMediaErrorPayload | string

// Default transport will be remote ( websocket )
export type TransportType = 'local' | 'remote'

export interface InitialConfig {
    wsAddress: string;
    poolingIntervalInMs: number;
    transportType: TransportType;
    accessToken?: string;
}

export interface ClientPayload {
    what: OnExtensionStats | OnRequestAccessToken | OnRequestInitialConfig | OnRequestRawStats | OnUserMediaError;
    data: Data;
}

export interface WorkerPayload {
    what: OnLocalTransport | RequestAccessToken | RequestInitialConfig | RequestRawStats;
    data?: PeerConnectionSample[];
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onRequestInitialConfig: () => void;
    onTransportCallback: (peerConnectionSamples?: PeerConnectionSample[]) => void;
    onRequestAccessToken: () => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: (rawStats: RawStats[]) => void;
    onResponseInitialConfig: (rawStats: InitialConfig) => void;
    onUserMediaError: (mediaError: UserMediaErrorPayload) => void;
    onExtensionStats: (extensionStats: ExtensionStatsPayload) => void;
    onAccessToken: (accessToken: string) => void;
}
