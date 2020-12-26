import type {
    ClientCallback,
    ClientPayload
} from '../types'
import type {
    ObserverStats
} from '../../observer.collector/rtc.collector'
import {
    logger
} from '../../observer.logger'

class CollectorWorker {
    private _worker!: Worker

    constructor (private readonly loadURL: string, private readonly clientCallback?: ClientCallback) {
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

    public sendRawStats (rawStats: ObserverStats[]): void {
        const payload = {
            'data': rawStats,
            'what': 'rawStats'
        } as ClientPayload
        this._worker.postMessage(payload)
    }

    public onError (err: any): void {
        logger.error(err)
        this.clientCallback?.onError(err)
    }

    public onMessage (msg: any): void {
        logger.warn(msg)
    }
}

export {
    CollectorWorker
}
