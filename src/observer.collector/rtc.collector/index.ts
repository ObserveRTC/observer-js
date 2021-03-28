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
    private marker?: string
    private browserId?: string
    constructor () {
        this.collect = this.collect.bind(this)
    }

    public updateMarker (marker: string): void {
        this.marker = marker
    }

    public setBrowserId (browserId: string): void {
        this.browserId = browserId
    }

    public async collect (rtcList: ObserverPC[]): Promise<RawStats[]> {
        const statsList = await Promise.all(rtcList.map(async (observerPc) => this.collectStats(observerPc)))
        return statsList
    }

    public async collectUserMediaError (errName: string): Promise<UserMediaErrorPayload> {
        return {
            'details': {
                'browserId': this.browserId ?? await observerSingleton.getBrowserId(),
                'clientDetails': BrowserUtil.getClientDetails(),
                'deviceList': await BrowserUtil.getDeviceList(),
                'marker': this.marker,
                'timeZoneOffsetInMinute': TimeUtil.getTimeZoneOffsetInMinute(),
                'timestamp': TimeUtil.getCurrent()
            },
            errName
        } as UserMediaErrorPayload
    }

    private async collectStats (observerPc: ObserverPC): Promise<RawStats> {
        const stats = await observerPc.getStats()
        const pcDetails = await observerPc.getPcDetails(
            this.marker,
            this.browserId
        )
        return {
            'details': pcDetails,
            stats
        } as RawStats
    }
}

export {
    RTCCollector
}
