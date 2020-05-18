import { IWobserverPlugin } from '../iwobserver.plugin'

class StatsParser implements IWobserverPlugin{
    receiveStats(sample: any): void {
        // not implemented
    }

    execute(): void {
        console.warn('i am executing')
    }

}

export default StatsParser
