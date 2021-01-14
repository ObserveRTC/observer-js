import type {
    RawStats
} from '../../../observer.collector/rtc.collector'

class MediaSoupOptimizer {
    isMediaSoupIntegration (rawStats: RawStats[]): boolean {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers,@typescript-eslint/no-unnecessary-condition,@typescript-eslint/strict-boolean-expressions
        return rawStats && rawStats.length > 0 && rawStats[0].details.integration === 'Mediasoup'
    }

    filterShortCalls (rawStats: RawStats[]): RawStats[] {
        return rawStats.filter(this.hasStats.bind(this))
    }

    private hasStats (rawStats: RawStats): boolean {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        return rawStats.stats.receiverStats.length > 0 || rawStats.stats.senderStats.length > 0
    }
}

export {
    MediaSoupOptimizer
}
