import type {
    ExtensionStatsPayload
} from '../../observer.collector/rtc.collector'

class ExtensionStats {
    private statsList: ExtensionStatsPayload[] = []
    add = (stats: ExtensionStatsPayload): void => {
        try {
            const {
                extensionType, payload
            } = stats
            // If both empty then ignore them
            if (!payload && !extensionType) {
                return
            }
            this.statsList.push({
                extensionType,
                'payload': typeof payload === 'string'
                    ? payload
                    : JSON.stringify(payload)
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
