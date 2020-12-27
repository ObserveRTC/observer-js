import {
    TimeUtil
} from '../../observer.utils/time.util'
import type {
    LocalCandidateElement,
    PeerConnectionSample, RemoteCandidateElement
} from '../../schema/v20200114'

// 15 seconds
const statsExpireTime = 15000
class StatsOptimizer {
    private _lastStatList: PeerConnectionSample[] = []
    constructor () {
        this.addStatBulk = this.addStatBulk.bind(this)
        this.getLast = this.getLast.bind(this)
        this.removeOldBulk = this.removeOldBulk.bind(this)
        this.isEqual = this.isEqual.bind(this)
        this.excludeSameCandidates = this.excludeSameCandidates.bind(this)
    }

    excludeSameCandidates (currentStats: PeerConnectionSample): PeerConnectionSample {
        const previousStats = this.getLast(currentStats)
        if (!previousStats) {
            return currentStats
        }
        const retval = JSON.parse(JSON.stringify(currentStats)) as PeerConnectionSample
        if (this.isEqual(
            previousStats.iceStats?.localCandidates,
            currentStats.iceStats?.localCandidates
        )) {
            delete retval.iceStats?.localCandidates
        }
        if (this.isEqual(
            previousStats.iceStats?.remoteCandidates,
            currentStats.iceStats?.remoteCandidates
        )) {
            delete retval.iceStats?.remoteCandidates
        }
        return retval
    }

    addStatBulk (currentStatsList: PeerConnectionSample[]): void {
        this._lastStatList.push(...currentStatsList)
        this.removeOldBulk()
    }

    private isEqual (
        previousCandidate: LocalCandidateElement[] | RemoteCandidateElement[] = [],
        currentCandidate: LocalCandidateElement[] | RemoteCandidateElement[] = []
    ): boolean {
        return currentCandidate.
            every((candidate) => previousCandidate.
                some((item) => item.id === candidate.id))
    }

    private removeOldBulk (): void {
        const now = TimeUtil.getCurrent()

        /*
         * Only keep new stats that does not cross 'statsExpireTime'
         * and does not already have a entry
         */
        this._lastStatList = this._lastStatList.
            filter((pcStats) => now - pcStats.timestamp < statsExpireTime)
    }

    private getLast (currentStats: PeerConnectionSample): PeerConnectionSample | undefined {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        for (let index = this._lastStatList.length - 1; index >= 0; index -= 1) {
            if (this._lastStatList[index].peerConnectionId === currentStats.peerConnectionId) {
                return this._lastStatList[index]
            }
        }
        // eslint-disable-next-line no-undefined
        return undefined
    }
}

export {
    StatsOptimizer
}
