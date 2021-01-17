import lodash from 'lodash'

import {
    TimeUtil
} from '../../observer.utils/time.util'
import type {
    PeerConnectionSample
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
        this.isSameLocalIceCandidate = this.isSameLocalIceCandidate.bind(this)
        this.isSameRemoteIceCandidate = this.isSameRemoteIceCandidate.bind(this)
        this.isSameClientDetails = this.isSameClientDetails.bind(this)
        this.isSameDeviceList = this.isSameDeviceList.bind(this)
    }

    excludeSameCandidates (currentStats: PeerConnectionSample): PeerConnectionSample {
        const previousStats = this.getLast(currentStats)
        if (!previousStats) {
            // If there is no previous stats
            return currentStats
        }
        const omitList = []
        // Check if local ice candidates are same
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.isSameLocalIceCandidate(
            previousStats,
            currentStats
        ) && omitList.push('iceStats.localCandidates')
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.isSameLocalIceCandidate(
            previousStats,
            currentStats
        ) && omitList.push('iceStats.remoteCandidates')
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.isSameClientDetails(
            previousStats,
            currentStats
        ) && omitList.push('clientDetails')
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.isSameDeviceList(
            previousStats,
            currentStats
        ) && omitList.push('deviceList')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        const retval = lodash.omit(
            currentStats,
            omitList
        ) as PeerConnectionSample
        return retval
    }

    addStatBulk (currentStatsList: PeerConnectionSample[]): void {
        this._lastStatList.push(...currentStatsList)
        this.removeOldBulk()
    }

    private isSameLocalIceCandidate (previousStats: PeerConnectionSample, currentStats: PeerConnectionSample): boolean {
        return this.isEqual(
            previousStats.iceStats?.localCandidates,
            currentStats.iceStats?.localCandidates
        )
    }
    private isSameRemoteIceCandidate (previousStats: PeerConnectionSample, currentStats: PeerConnectionSample): boolean {
        return this.isEqual(
            previousStats.iceStats?.remoteCandidates,
            currentStats.iceStats?.remoteCandidates
        )
    }
    private isSameClientDetails (previousStats: PeerConnectionSample, currentStats: PeerConnectionSample): boolean {
        return this.isEqual(
            previousStats.clientDetails,
            currentStats.clientDetails
        )
    }
    private isSameDeviceList (previousStats: PeerConnectionSample, currentStats: PeerConnectionSample): boolean {
        return this.isEqual(
            previousStats.deviceList,
            currentStats.deviceList
        )
    }

    private isEqual (previousStats: any, currentStats: any): boolean {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        return lodash.isEqual(
            previousStats,
            currentStats
        ) as boolean
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
