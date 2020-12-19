// @ts-ignore
import logger from '../../observer.logger'
import { getThing } from '../../web.workers/index.worker' // make sure the file name ends with .worker.ts
import Observer from '../api'
import { PCDetails } from './peer'


interface ObserverStats {
    stats: any
    details: PCDetails
}
class Collector {
    private inst: any
    constructor(private readonly observer: Observer) {
        this.run = this.run.bind(this)
        this.runAsync = this.runAsync.bind(this)
        this.demo = this.demo.bind(this)

    }

    async demo() {
        console.log(await getThing())
    }

    private async runAsync(): Promise<any> {
        await this.demo()
        const statsList =
            await Promise.all(
                this.observer.rtcList.map( async (value): Promise<ObserverStats> => {
                    const stats =  await value.getStats()
                    const pcDetails = value.pcDetails
                    return {
                        details: pcDetails,
                        stats,
                    } as ObserverStats
                })
            )
        logger.warn(statsList)
        return undefined
    }
    public run() {
        this.runAsync().catch(null)
    }
}

export default Collector
