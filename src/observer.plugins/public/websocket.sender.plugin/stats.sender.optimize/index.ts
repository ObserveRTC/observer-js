import logger from '../../../../observer.logger'
import { IObserverStats } from '../../../../observer.pc'
import { LocalCandidateElement, RemoteCandidateElement } from '../../../../schema/v20200114'

class SenderOptimizer {
    private static isEqual(previousCandidate: LocalCandidateElement[] | RemoteCandidateElement[] = [],
                             currentCandidate: LocalCandidateElement[] | RemoteCandidateElement[] = []): boolean {
        return currentCandidate
            .every(candidate => previousCandidate
                .some(item => item.id === candidate.id))
    }
    public static getStatsForSending(previousStats: IObserverStats, currentStats: IObserverStats): IObserverStats {
        const retval = JSON.parse(JSON.stringify(currentStats))
        if (this.isEqual(previousStats?.iceStats?.localCandidates, currentStats?.iceStats?.localCandidates)) {
            delete retval?.iceStats?.localCandidates
        }
        if (this.isEqual(previousStats?.iceStats?.remoteCandidates, currentStats?.iceStats?.remoteCandidates)) {
            delete retval?.iceStats?.remoteCandidates
        }
        return retval
    }
}

export default SenderOptimizer
