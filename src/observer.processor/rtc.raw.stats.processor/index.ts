import type {
    ObserverStats
} from '../../observer.collector/observer.peer'
import type {
    IceStats, ReceiverStats
} from '../../schema/v20200114'
import StatsMap from '../../schema/v20200114/stats.map'

// @ts-expect-error stupid workaround
export interface SendRecv extends RTCRtpReceiver, RTCRtpSender {
    type: string;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class RawStatsProcessor {
    public static getSendRecvStats (rawStats: SendRecv[]): ReceiverStats {
        const inboundRTPStats = rawStats.filter((stats) => stats.type === 'inbound-rtp').map((stats) => StatsMap.inboundRTPStatElement(stats))
        const mediaSources = rawStats.filter((stats) => stats.type === 'media-source').map((stats) => StatsMap.mediaSource(stats))
        const outboundRTPStats = rawStats.filter((stats) => stats.type === 'outbound-rtp').map((stats) => StatsMap.outboundRTPStatElement(stats))
        const remoteInboundRTPStats = rawStats.filter((stats) => stats.type === 'remote-inbound-rtp').map((stats) => StatsMap.remoteInboundRTPStatElement(stats))
        const tracks = rawStats.filter((stats) => stats.type === 'track').map((stats) => StatsMap.track(stats))
        return {
            inboundRTPStats,
            mediaSources,
            outboundRTPStats,
            remoteInboundRTPStats,
            tracks
        } as ReceiverStats
    }

    public static getIceStats (observerStats: ObserverStats): IceStats {
        const {
            receiverStats, senderStats
        } = observerStats

        const localCandidates = [
            ...receiverStats.map((item) => item as SendRecv).filter((item) => item.type === 'local-candidate'),
            ...senderStats.map((item) => item as SendRecv).filter((item) => item.type === 'local-candidate')
        ].map((stats) => StatsMap.localCandidate(stats))

        const remoteCandidates = [
            ...receiverStats.map((item) => item as SendRecv).filter((item) => item.type === 'remote-candidate'),
            ...senderStats.map((item) => item as SendRecv).filter((item) => item.type === 'remote-candidate')
        ].map((stats) => StatsMap.remoteCandidate(stats))


        const candidatePairs = [
            ...receiverStats.map((item) => item as SendRecv).filter((item) => item.type === 'candidate-pair'),
            ...senderStats.map((item) => item as SendRecv).filter((item) => item.type === 'candidate-pair')
        ].map((stats) => StatsMap.candidatePair(stats))

        return {
            candidatePairs,
            localCandidates,
            remoteCandidates
        } as IceStats
    }
}

export {
    RawStatsProcessor
}
