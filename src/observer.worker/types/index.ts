
type RawStats = 'rawStats'

export interface WorkerPayload {
    what: RawStats;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

export interface WorkerCallback {
    onMessage: (msg: any) => void;
    onRequestRawStats: () => void;
    onError: (err: any) => void;
}
