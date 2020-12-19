enum StatsType {
    inboundRTP = 'inbound-rtp',
    mediaSource = 'media-source',
    outboundRtp = 'outbound-rtp',
    remoteInboundRtp = 'remote-inbound-rtp',
    track = 'track',
    localCandidate = 'local-candidate',
    remoteCandidate = 'remote-candidate',
    candidatePair = 'candidate-pair',
}

class RTCProcessor {
    private static async getProcessedStatsByKey(rawRTCStats: any[], key: string): Promise<any> {
        return rawRTCStats ?.filter(stats => stats?.type === key)
    }

    public static async getProcessedStats(rawRTCStats: any[]): Promise<any> {
        const result = Promise.all([
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.inboundRTP),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.mediaSource),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.outboundRtp),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.remoteInboundRtp),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.localCandidate),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.remoteCandidate),
            RTCProcessor.getProcessedStatsByKey(rawRTCStats, StatsType.candidatePair),
        ])
        return result
    }
}

export default RTCProcessor

