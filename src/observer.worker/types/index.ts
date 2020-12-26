import type {
    RawStats
} from '../../observer.collector/rtc.collector'

type RequestRawStats = 'requestRawStats'
type OnRequestRawStats = 'onRequestRawStats'

export interface ClientPayload {
    what: OnRequestRawStats;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

export interface WorkerPayload {
    what: RequestRawStats;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: (rawStats: RawStats[]) => void;
}
