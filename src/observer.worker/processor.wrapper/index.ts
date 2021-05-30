import type {
    ExtensionStatsPayload,
    RawStats, UserMediaErrorPayload
} from '../../observer.collector/rtc.collector'
import {
    logger
} from '../../observer.logger'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'
import type {
    ClientPayload,
    InitialConfig,
    WorkerCallback,
    WorkerPayload
} from '../types'


class ProcessorWorker {
    private _workerScope?: any
    constructor (private readonly _workerCallback?: WorkerCallback) {
        this.setWorkerScope = this.setWorkerScope.bind(this)
        this.onMessage = this.onMessage.bind(this)
        this.requestInitialConfig = this.requestInitialConfig.bind(this)
        this.requestRawStats = this.requestRawStats.bind(this)
        this.sendTransportData = this.sendTransportData.bind(this)
    }

    setWorkerScope (workerScope: any): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this._workerScope = workerScope
    }

    onMessage (msg: MessageEvent): void {
        const data = msg.data as ClientPayload
        switch (data.what) {
            case 'onRequestRawStats':
                this._workerCallback?.onResponseRawStats(data.data as RawStats[])
                return
            case 'onRequestInitialConfig':
                this._workerCallback?.onResponseInitialConfig(data.data as InitialConfig)
                return
            case 'onUserMediaError':
                this._workerCallback?.onUserMediaError(data.data as UserMediaErrorPayload)
                return
            case 'onRequestAccessToken':
                this._workerCallback?.onAccessToken(data.data as string)
                return
            case 'onExtensionStats':
                this._workerCallback?.onExtensionStats(data.data as ExtensionStatsPayload)
                return
            default:
                logger.warn(
                    'unknown types',
                    data
                )
        }
    }

    requestInitialConfig (): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this._workerScope.postMessage({'what': 'requestInitialConfig'} as WorkerPayload)
    }

    requestAccessToken (): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this._workerScope.postMessage({'what': 'requestAccessToken'} as WorkerPayload)
    }

    requestRawStats (): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this._workerScope.postMessage({'what': 'requestRawStats'} as WorkerPayload)
    }

    sendTransportData (samples: PeerConnectionSample[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this._workerScope.postMessage({
            'data': samples,
            'what': 'onLocalTransport'
        } as WorkerPayload)
    }
}

export {
    ProcessorWorker
}
