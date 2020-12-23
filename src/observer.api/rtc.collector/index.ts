import { logger } from '../../observer.logger'
import { Observer } from '../observer'
import { ObserverPC, PCDetails } from '../observer.peer'


interface ObserverStats {
    stats: any
    details: PCDetails
}

class RTCCollector {
    constructor(private readonly observer: Observer) {
        this.collect = this.collect.bind(this)
    }

    public async collect(): Promise<any> {
        const statsList =
            await Promise.all(
                this.observer.rtcList.map( async (value: ObserverPC): Promise<ObserverStats> => {
                    const stats =  await value.getStats()
                    const pcDetails = value.pcDetails
                    return {
                        details: pcDetails,
                        stats,
                    } as ObserverStats
                })
            )
        logger.warn(statsList)
        return statsList
    }
}

export { RTCCollector }
