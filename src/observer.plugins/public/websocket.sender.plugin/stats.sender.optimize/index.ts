import logger from '../../../../observer.logger'
import { IObserverStats } from '../../../../observer.pc'

class SenderOptimizer {
    public static getStatsForSending(previousStats: IObserverStats, currentStats: IObserverStats): IObserverStats {
        const previousIceStats = previousStats?.iceStats
        const currentIceStats = currentStats?.iceStats
        const retval = { ...currentStats}
        if (JSON.stringify(previousIceStats?.localCandidates) === JSON.stringify(currentIceStats?.localCandidates)) {
            delete currentStats?.iceStats?.localCandidates
        }
        if (JSON.stringify(previousIceStats?.remoteCandidates) === JSON.stringify(currentIceStats?.remoteCandidates)) {
            delete currentStats?.iceStats?.remoteCandidates
        }
        logger.warn(retval)
        return retval
    }
}

export default SenderOptimizer
