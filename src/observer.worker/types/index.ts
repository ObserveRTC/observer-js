
type RawStats = 'rawStats'

export interface ClientPayload {
    what: RawStats;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

export interface ClientCallback {
    onRequestRawStats: () => void;
    onError: (err: any) => void;
}

export interface WorkerCallback {
    onResponseRawStats: () => void;
}
