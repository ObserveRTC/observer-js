import {
    logger
} from '../../observer.logger'
import {
    CollectorWorker
} from '../../observer.worker/collector.wrapper'
import type {
    ClientCallback, InitialConfig
} from '../../observer.worker/types'
import type {
    UserConfig
} from '../observer.peer'
import {
    ObserverPC
} from '../observer.peer'
import type {
    RawStats
} from '../rtc.collector'
import {
    RTCCollector
} from '../rtc.collector'

class Observer implements ClientCallback {
    private _rtcList: ObserverPC[] = []
    private readonly _collector = new RTCCollector()
    private readonly _collectorWorker = new CollectorWorker(
        // @ts-expect-error Will be injected in build time
        __workerUrl__,
        this
    )
    constructor (private readonly _initializeConfig: InitialConfig) {
        this.addPC = this.addPC.bind(this)
        this.removePC = this.removePC.bind(this)
        this._collectorWorker.loadWorker()
        // eslint-disable-next-line no-console
        console.warn(
            '$ObserverRTC version[collector]',
            // @ts-expect-error Will be injected in build time
            __buildVersion__,
            'from build date',
            // @ts-expect-error Will be injected in build time
            __buildDate__
        )
    }

    onError (_err: any): void {
        // Pass
        logger.warn(_err)
    }

    onRequestRawStats (): void {
        // Before collecting stats, check if those pc are active
        this._rtcList = this._rtcList.filter((pc: ObserverPC) => {
            // Update connection state
            pc.updateConnectionState()
            return !pc.isExpired
        })
        // Now collect stats for all active peer connections
        this._collector.collect(this._rtcList).then((rawStats: RawStats[]) => {
            this._collectorWorker.sendRawStats(rawStats)
        }).catch(null)
    }

    onRequestInitialConfig (): void {
        this._collectorWorker.sendInitialConfig(this._initializeConfig)
    }

    public addPC (pc: RTCPeerConnection, callId?: string, userId?: string): void {
        const userConfig = {
            callId,
            pc,
            userId
        } as UserConfig
        logger.warn(
            'adding pc',
            userConfig
        )
        this._rtcList.push(new ObserverPC(userConfig))
    }

    public removePC (pc: ObserverPC): void {
        this._rtcList = this._rtcList.filter((value) => value.id !== pc.id)
    }

    get rtcList (): ObserverPC[] {
        return this._rtcList
    }

    public dispose (): void {
        this._rtcList = []
    }
}

export {
    Observer
}
