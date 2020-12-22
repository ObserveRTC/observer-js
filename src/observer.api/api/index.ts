import { logger } from '../../observer.logger'
import { CronInterval } from '../../observer.utils/cron'
import ObserverPC, { UserConfig } from '../observer.peer'
import { RTCCollector } from '../rtc.collector'

class Observer {
    private _rtcList: ObserverPC[] = []
    private _worker: CronInterval = new CronInterval()
    private _collector = new RTCCollector(this)

    constructor() {
        this.addPC = this.addPC.bind(this)
        this.removePC = this.removePC.bind(this)
        this._worker.start(this._collector.run, 1000, true)
        // @ts-ignore
        console.warn('$ObserverRTC version', LIBRARY_VERSION)
    }

    public addPC(pc: RTCPeerConnection, callId?: string, userId?: string) {
        const userConfig = {
            callId,
            pc,
            userId
        } as UserConfig
        logger.warn('adding pc', userConfig)
        this._rtcList.push(new ObserverPC(userConfig))
    }

    public removePC(pc: ObserverPC) {
        this._rtcList = this._rtcList.filter(value => value.id !== pc.id)
    }

    get rtcList(): ObserverPC[] {
        return this._rtcList
    }

    public dispose() {
        this._rtcList = []
    }
}

export { Observer }
