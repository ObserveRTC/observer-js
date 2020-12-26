import type {
    ClientPayload,
    WorkerCallback,
    WorkerPayload
} from '../types'
import {
    logger
} from '../../observer.logger'


class ProcessorWorker {
    private _workerScope?: any
    constructor (private readonly _workerCallback?: WorkerCallback) {
        this.setWorkerScope = this.setWorkerScope.bind(this)
        this.onMessage = this.onMessage.bind(this)
        this.requestRawStats = this.requestRawStats.bind(this)
    }

    setWorkerScope (workerScope: any): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this._workerScope = workerScope
    }

    onMessage (msg: MessageEvent): void {
        const data = msg.data as ClientPayload
        switch (data.what) {
            case 'onRequestRawStats':
                this._workerCallback?.onResponseRawStats(data.data)
                return
            default:
                logger.warn(
                    'unknown types',
                    data
                )
        }
        logger.warn(event)
    }

    requestRawStats (): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this._workerScope.postMessage({'what': 'requestRawStats'} as WorkerPayload)
    }
}

export {
    ProcessorWorker
}
