import { v4 as uuidv4 } from 'uuid'
import observerSingleton from '../../../observer.singleton'
import TimeUtil from '../../../observer.utils/time.util'
import StatsParser from '../stats.parser'

export interface UserConfig {
    pc: RTCPeerConnection
    callId?: string
    userId?: string
}

export interface PCDetails {
    browserId?:              string
    callId?:                 string
    peerConnectionId?:       string
    timeZoneOffsetInMinute?: number
    userId?:                 string
}

class ObserverPC {
    private readonly _id: string = uuidv4()
    private readonly timeZoneOffsetInMinute: number = TimeUtil.getTimeZoneOffsetInMinute()
    private browserId?: string
    constructor(private readonly userConfig: UserConfig) {
        this.getStats = this.getStats.bind(this)
        observerSingleton.getBrowserId().then(value => this.browserId = value)
    }

    get id(): string {
        return this._id
    }

    get pcDetails(): PCDetails {
        return {
            browserId: this.browserId,
            callId: this.userConfig?.callId,
            peerConnectionId: this._id,
            timeZoneOffsetInMinute: this.timeZoneOffsetInMinute,
            userId: this.userConfig?.userId
        } as PCDetails
    }

    public async getStats(): Promise<any> {
        const receiverList = StatsParser.getReceiver(this.userConfig?.pc)
        const senderList = StatsParser.getSender(this.userConfig?.pc)
        return Promise.all([
            StatsParser.getRawStats(receiverList),
            StatsParser.getRawStats(senderList),
        ])
    }

}

export default ObserverPC
