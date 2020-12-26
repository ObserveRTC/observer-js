import type {
    ClientCallback,
    ClientPayload,
    WorkerPayload
} from '../types'
import type {
    RawStats
} from '../../observer.collector/rtc.collector'
import {
    logger
} from '../../observer.logger'

class CollectorWorker {
    private _worker!: Worker

    constructor (private readonly loadURL: string, private readonly _clientCallback?: ClientCallback) {
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

    public sendRawStats (rawStats: RawStats[]): void {
        const payload = {
            'data': rawStats,
            'what': 'onRequestRawStats'
        } as ClientPayload
        this._worker.postMessage(payload)
    }

    public onError (err: any): void {
        logger.error(err)
        this._clientCallback?.onError(err)
    }

    public onMessage (msg: MessageEvent): void {
        const data = msg.data as WorkerPayload
        switch (data.what) {
            case 'requestRawStats':
                this._clientCallback?.onRequestRawStats()
                return
            default:
                logger.warn(
                    'unknown types',
                    data
                )
        }
    }
}

export {
    CollectorWorker
}
