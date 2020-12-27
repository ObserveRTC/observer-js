import {
    v4 as uuidv4
} from 'uuid'

import {
    observerSingleton
} from '../../observer.singleton'
import {
    TimeUtil
} from '../../observer.utils/time.util'
import {
    RawStatsCollector
} from '../rtc.raw.stats.collector'
import {
    RTCState
} from '../rtc.state'

export interface UserConfig {
    pc: RTCPeerConnection;
    callId?: string;
    userId?: string;
}

export interface PCDetails {
    browserId?: string;
    callId?: string;
    peerConnectionId?: string;
    timeZoneOffsetInMinute?: number;
    userId?: string;
    timestamp?: number;
}

export interface ObserverStats {
    receiverStats: RTCRtpReceiver[];
    senderStats: RTCRtpSender[];
}

class ObserverPC {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    private readonly _id: string = uuidv4()
    private readonly _timeZoneOffsetInMinute: number = TimeUtil.getTimeZoneOffsetInMinute()
    private _browserId?: string
    private readonly _rtcState = new RTCState()

    constructor (private readonly userConfig: UserConfig) {
        this.updateConnectionState = this.updateConnectionState.bind(this)
        this.getStats = this.getStats.bind(this)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        observerSingleton.getBrowserId().then((value) => {
            this._browserId = value
        })
    }

    get id (): string {
        return this._id
    }

    get pcDetails (): PCDetails {
        return {
            'browserId': this._browserId,
            'callId': this.userConfig.callId,
            'peerConnectionId': this._id,
            'timeZoneOffsetInMinute': this._timeZoneOffsetInMinute,
            'timestamp': TimeUtil.getCurrent(),
            'userId': this.userConfig.userId
        } as PCDetails
    }

    get isExpired (): boolean {
        return this._rtcState.isExpired()
    }

    public updateConnectionState (): void {
        const currentState = this.userConfig.pc.connectionState
        this._rtcState.updateState(currentState)
    }

    public async getStats (): Promise<ObserverStats> {
        const receiverList = RawStatsCollector.getReceiver(this.userConfig.pc)
        const senderList = RawStatsCollector.getSender(this.userConfig.pc)
        const [
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            receiverStats,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            senderStats
        ] = await Promise.all([
            RawStatsCollector.getRawStats(receiverList),
            RawStatsCollector.getRawStats(senderList)
        ])
        return {
            'receiverStats': receiverStats as RTCRtpReceiver[],
            'senderStats': senderStats as RTCRtpSender[]
        } as ObserverStats
    }
}

export {
    ObserverPC
}
