import { IWobserverPlugin } from '../iwobserver.plugin'

class StatsParser implements IWobserverPlugin{
    receiveStats(sample: any): void {
        // not implemented
    }

}

export default StatsParser
