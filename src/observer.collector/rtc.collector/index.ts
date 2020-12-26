import type {
    ObserverPC, PCDetails
} from '../observer.peer'

import type {
    Observer
} from '../observer'

export interface ObserverStats {
    stats: any;
    details: PCDetails;
}

class RTCCollector {
    constructor (private readonly observer: Observer) {
        this.collect = this.collect.bind(this)
    }

    public async collect (): Promise<ObserverStats[]> {
        const statsList = await Promise.all(this.observer.rtcList.map(async (observerPc) => this.collectStats(observerPc)))
        return statsList
    }

    private async collectStats (observerPc: ObserverPC): Promise<ObserverStats> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const stats = await observerPc.getStats(),
            {pcDetails} = observerPc
        return {
            'details': pcDetails,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            stats
        } as ObserverStats
    }
}

export {
    RTCCollector
}
