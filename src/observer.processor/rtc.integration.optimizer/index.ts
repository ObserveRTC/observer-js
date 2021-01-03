import type {
    RawStats
} from '../../observer.collector/rtc.collector'
import {
    TokBoxOptimizer
} from './tokbox'


class IntegrationOptimizer {
    private readonly _tokBoxOptimizer = new TokBoxOptimizer()
    optimize (rawStats: RawStats[]): RawStats[] {
        if (this._tokBoxOptimizer.isTokBoxIntegration(rawStats)) {
            return this._tokBoxOptimizer.filterShortCalls(rawStats)
        }
        return rawStats
    }
}

export {
    IntegrationOptimizer
}
