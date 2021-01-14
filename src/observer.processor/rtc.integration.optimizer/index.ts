import type {
    RawStats
} from '../../observer.collector/rtc.collector'
import {
    MediaSoupOptimizer
} from './mediasoup'
import {
    TokBoxOptimizer
} from './tokbox'


class IntegrationOptimizer {
    private readonly _tokBoxOptimizer = new TokBoxOptimizer()
    private readonly _mediaSoupOptimizer = new MediaSoupOptimizer()
    optimize (rawStats: RawStats[]): RawStats[] {
        if (this._tokBoxOptimizer.isTokBoxIntegration(rawStats)) {
            return this._tokBoxOptimizer.filterShortCalls(rawStats)
        }
        if (this._mediaSoupOptimizer.isMediaSoupIntegration(rawStats)) {
            return this._mediaSoupOptimizer.filterShortCalls(rawStats)
        }
        return rawStats
    }
}

export {
    IntegrationOptimizer
}
