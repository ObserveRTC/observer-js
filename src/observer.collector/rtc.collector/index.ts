import type {
    ObserverPC, PCDetails
} from '../observer.peer'

export interface RawStats {
    stats: any;
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const stats = await observerPc.getStats(),
            {pcDetails} = observerPc
        return {
            'details': pcDetails,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            stats
        } as RawStats
    }
}

export {
    RTCCollector
}
