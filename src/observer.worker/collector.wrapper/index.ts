import type {
    ObserverStats
} from '../../observer.collector/rtc.collector'
import {
    logger
} from '../../observer.logger'

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

class CollectorWorker {
    private _worker!: Worker

    constructor (private readonly loadURL: string, private readonly workerCallback?: WorkerCallback) {
        this.loadWorker = this.loadWorker.bind(this)
    }

    public loadWorker (): void {
        const contentURL = `importScripts( '${this.loadURL}' );`,
            workerURL = URL.createObjectURL(new Blob(
                [contentURL],
                {'type': 'text/javascript'}
            ))
        this._worker = new Worker(workerURL)
        this._worker.onerror = this.onError.bind(this)
        this._worker.onmessage = this.onMessage.bind(this)
    }

    public sendMessage (data: WorkerPayload): void {
        this._worker.postMessage(data)
    }

    public sendRawStats (rawStats: ObserverStats[]): void {
        const payload = {
            'data': rawStats,
            'what': 'rawStats'
        } as WorkerPayload
        this._worker.postMessage(payload)
    }

    public onError (err: any): void {
        logger.error(err)
        this.workerCallback?.onError(err)
    }

    public onMessage (msg: any): void {
        logger.warn(msg)
        this.workerCallback?.onMessage(msg)
    }
}

export {
    CollectorWorker, RawStats
}
