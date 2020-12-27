import type {
    RawStats
} from '../../observer.collector/rtc.collector'

type RequestRawStats = 'requestRawStats'
type OnRequestRawStats = 'onRequestRawStats'
type RequestInitialConfig = 'requestInitialConfig'
type OnRequestInitialConfig = 'onRequestInitialConfig'
type Data = RawStats[] | InitialConfig

export interface InitialConfig {
    wsAddress: string;
    poolingIntervalInMs: number;
}

export interface ClientPayload {
    what: OnRequestRawStats | OnRequestInitialConfig;
    data: Data;
}

export interface WorkerPayload {
    what: RequestRawStats | RequestInitialConfig;
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onRequestInitialConfig: () => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: (rawStats: RawStats[]) => void;
    onResponseInitialConfig: (rawStats: InitialConfig) => void;
}
