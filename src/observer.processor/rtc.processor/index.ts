enum StatsType {
    inboundRTP = 'inbound-rtp',
    mediaSource = 'media-source',
    outboundRtp = 'outbound-rtp',
    remoteInboundRtp = 'remote-inbound-rtp',
    track = 'track',
    localCandidate = 'local-candidate',
    remoteCandidate = 'remote-candidate',
    candidatePair = 'candidate-pair'
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class RTCProcessor {
    public static getProcessedStats (rawRTCStats: any[]): any {
        const result = [
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.inboundRTP
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.mediaSource
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.outboundRtp
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.remoteInboundRtp
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.localCandidate
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.remoteCandidate
            ),
            RTCProcessor.getProcessedStatsByKey(
                rawRTCStats,
                StatsType.candidatePair
            )
        ]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result
    }

    private static getProcessedStatsByKey (
        rawRTCStats: any[],
        key: string
    ): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return
        return rawRTCStats.filter((stats) => stats.type === key)
    }
}

export {
    RTCProcessor
}
