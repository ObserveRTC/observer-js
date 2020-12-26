import {
    CollectorWorker
} from '../../observer.worker/collector.wrapper'
import {
    ObserverPC
} from '../observer.peer'
import type {
    ObserverStats
} from '../rtc.collector'
import {
    RTCCollector
} from '../rtc.collector'
import type {
    UserConfig
} from '../observer.peer'
import type {
    WorkerCallback
} from '../../observer.worker/collector.wrapper'
import {
    logger
} from '../../observer.logger'

class Observer implements WorkerCallback {
    private _rtcList: ObserverPC[] = []

    private readonly _collector = new RTCCollector(this)


    private readonly _collectorWorker = new CollectorWorker(
        // @ts-expect-error Will be injected in build time
        __workerUrl__,
        this
    )

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    constructor () {
        this.addPC = this.addPC.bind(this)
        this.removePC = this.removePC.bind(this)
        this.collectState = this.collectState.bind(this)
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

    onMessage (_msg: any): void {
        // Pass
        logger.warn(_msg)
    }

    onError (_err: any): void {
        // Pass
        logger.warn(_err)
    }

    onRequestRawStats (): void {
        this._collector.collect().then((rawStats: ObserverStats[]) => {
            this._collectorWorker.sendRawStats(rawStats)
            // eslint-disable-next-line newline-per-chained-call
        }).catch(null)
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

    public async collectState (): Promise<any> {
        return this._collector.collect()
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
