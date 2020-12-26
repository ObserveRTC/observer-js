import type {
    ObserverPC, ObserverStats, PCDetails
} from '../observer.peer'

export interface RawStats {
    stats: ObserverStats;
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
