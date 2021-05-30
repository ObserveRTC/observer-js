import type {
    ExtensionStatsPayload
} from '../../observer.collector/rtc.collector'

class ExtensionStats {
    private statsList: ExtensionStatsPayload[] = []
    add = (stats: ExtensionStatsPayload): void => {
        try {
            const {
                payload, type
            } = stats
            this.statsList.push({
                'payload': typeof payload === 'string'
                    ? payload
                    : JSON.stringify(payload),
                type
            })
        } catch (err: unknown) {
            // Ignore
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    hasRecord = (): boolean => this.statsList.length > 0

    pick = (): ExtensionStatsPayload[] => {
        const retval = this.statsList.map((item) => item)
        this.statsList = []
        return retval
    }
}

export {
    ExtensionStats
}
