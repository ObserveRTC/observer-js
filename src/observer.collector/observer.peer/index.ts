import {
    v4 as uuidv4
} from 'uuid'

import {
    observerSingleton
} from '../../observer.singleton'
import {
    BrowserUtil
} from '../../observer.utils/browser.util'
import {
    TimeUtil
} from '../../observer.utils/time.util'
import type {
    ClientDetails,
    MediaDeviceInfo
} from '../../schema/v20200114'
import {
    RawStatsCollector
} from '../rtc.raw.stats.collector'
import {
    RTCState
} from '../rtc.state'

export type Integration = 'General' | 'Janus' | 'Jitsi' | 'Mediasoup' | 'Medooze' | 'PeerJS' | 'Pion' | 'TokBox' | 'Twilio'

export interface UserConfig {
    pc: RTCPeerConnection;
    callId?: string;
    userId?: string;
    integration?: Integration;
}

export interface PCDetails {
    browserId?: string;
    clientDetails?: ClientDetails;
    callId?: string;
    deviceList?: MediaDeviceInfo[];
    peerConnectionId?: string;
    timeZoneOffsetInMinute?: number;
    userId?: string;
    timestamp?: number;
    integration?: Integration;
    marker?: string;
}

export interface ObserverStats {
    receiverStats: RTCRtpReceiver[];
    senderStats: RTCRtpSender[];
}

class ObserverPC {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    private readonly _id: string = uuidv4()
    private readonly _timeZoneOffsetInMinute: number = TimeUtil.getTimeZoneOffsetInMinute()
    private readonly _rtcState = new RTCState()

    constructor (private readonly userConfig: UserConfig) {
        this.updateConnectionState = this.updateConnectionState.bind(this)
        this.getStats = this.getStats.bind(this)
    }

    get id (): string {
        return this._id
    }

    public async getPcDetails (marker?: string, browserId?: string): Promise<PCDetails> {
        return {
            'browserId': browserId ?? await observerSingleton.getBrowserId(),
            'callId': this.userConfig.callId,
            'clientDetails': BrowserUtil.getClientDetails(),
            'deviceList': observerSingleton.getActiveDeviceList(),
            'integration': this.userConfig.integration,
            marker,
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
        // eslint-disable-next-line
        const currentState = this.userConfig.pc
            ? this.userConfig.pc.connectionState
            : 'closed'
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
