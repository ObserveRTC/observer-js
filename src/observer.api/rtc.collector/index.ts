import { logger } from '../../observer.logger'
import { Observer } from '../api'
import ObserverPC, { PCDetails } from '../observer.peer'


interface ObserverStats {
    stats: any
    details: PCDetails
}

class RTCCollector {
    private inst: any
    constructor(private readonly observer: Observer) {
        this.run = this.run.bind(this)
        this.runAsync = this.runAsync.bind(this)
    }

    public run() {
        this.runAsync().catch(null)
    }

    private async runAsync(): Promise<any> {
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
