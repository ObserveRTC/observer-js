import type {
    RawStats
} from '../../observer.collector/rtc.collector'

type RequestRawStats = 'requestRawStats'
type OnRequestRawStats = 'onRequestRawStats'

export interface ClientPayload {
    what: OnRequestRawStats;
    data: RawStats[];
}

export interface WorkerPayload {
    what: RequestRawStats;
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: (rawStats: RawStats[]) => void;
}
