import {
    observerSingleton
} from '../../observer.singleton'
import {
    TimeUtil
} from '../../observer.utils/time.util'
import type {
    ObserverPC, ObserverStats, PCDetails
} from '../observer.peer'

export interface RawStats {
    stats: ObserverStats;
    details: PCDetails;
}

export interface UserMediaErrorPayload {
    errName: string;
    details: PCDetails;
}

class RTCCollector {
    constructor () {
        this.collect = this.collect.bind(this)
    }

    public async collect (rtcList: ObserverPC[]): Promise<RawStats[]> {
        const statsList = await Promise.all(rtcList.map(async (observerPc) => this.collectStats(observerPc)))
        return statsList
    }

    public async collectUserMediaError (errName: string): Promise<UserMediaErrorPayload> {
        return {
            'details': {
                'browserId': await observerSingleton.getBrowserId(),
                'timeZoneOffsetInMinute': TimeUtil.getTimeZoneOffsetInMinute(),
                'timestamp': TimeUtil.getCurrent()
            },
            errName
        } as UserMediaErrorPayload
    }

    private async collectStats (observerPc: ObserverPC): Promise<RawStats> {
        const stats = await observerPc.getStats()
        const {pcDetails} = observerPc
        return {
            'details': pcDetails,
            stats
        } as RawStats
    }
}

export {
    RTCCollector
}
