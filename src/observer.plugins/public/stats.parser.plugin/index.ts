import ObserverPC, { IObserverStats } from '../../../observer.pc'
import { IceStats, ReceiverStats } from '../../../schema/v20200114'
import StatsMap from '../../../schema/v20200114/stats.map'
import { ObserverPlugin } from '../../base.plugin'


class StatsParser extends ObserverPlugin {
    public async execute(observerPC: ObserverPC): Promise<IObserverStats> {
        const [rawReceiverStats, rawSenderStats] = await Promise.all([
            this.getStats(observerPC?.getPeerConnection()?.getReceivers()),
            this.getStats(observerPC?.getPeerConnection()?.getSenders())
        ])
        const iceStats = await this.getIceStats(rawReceiverStats, rawSenderStats)
        const receiverStats = await this.getSendRecvStats(rawReceiverStats)
        const senderStats = await this.getSendRecvStats(rawSenderStats)
        return {
            iceStats,
            receiverStats,
            senderStats,
        } as IObserverStats
    }

    private async getSendRecvStats(rawStats?: any[]): Promise<ReceiverStats> {
        // logger.warn('->', rawStats)
        const inboundRTPStats = rawStats?.filter(stats => stats?.type === 'inbound-rtp').map(stats => StatsMap.inboundRTPStatElement(stats))
        const mediaSources = rawStats?.filter(stats => stats?.type === 'media-source').map(stats => StatsMap.mediaSource(stats))
        const outboundRTPStats = rawStats?.filter(stats => stats?.type === 'outbound-rtp').map(stats => StatsMap.outboundRTPStatElement(stats))
        const remoteInboundRTPStats = rawStats?.filter(stats => stats?.type === 'remote-inbound-rtp').map(stats => StatsMap.remoteInboundRTPStatElement(stats))
        const tracks = rawStats?.filter(stats => stats?.type === 'track').map(stats => StatsMap.track(stats))
        return {
            inboundRTPStats,
            mediaSources,
            outboundRTPStats,
            remoteInboundRTPStats,
            tracks
        } as ReceiverStats
    }

    private async getStats(senderOrReceiver: RTCRtpSender[] | RTCRtpReceiver[]): Promise<any> {
        if (!senderOrReceiver) {
            return undefined
        }
        const statsList = []
        for (const currentStats of senderOrReceiver) {
            const stats: any = await currentStats.getStats()
            for (const value of stats?.values()) {
                statsList.push(value)
            }
        }
        return statsList
    }

    private async getIceStats(receiverStats: any, senderStats: any): Promise<IceStats> {
        const localCandidates = [
            ...receiverStats.filter( (item: any) => 'local-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'local-candidate' === item.type )].map( stats => StatsMap.localCandidate(stats) )

        const remoteCandidates = [
            ...receiverStats.filter( (item: any) => 'remote-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'remote-candidate' === item.type ) ].map( stats => StatsMap.remoteCandidate(stats) )

        const candidatePairs = [
            ...receiverStats.filter( (item: any) => 'candidate-pair' === item.type ),
            ...senderStats.filter( (item: any) => 'candidate-pair' === item.type ) ].map( stats => StatsMap.candidatePair(stats) )

        return {
            candidatePairs,
            localCandidates,
            remoteCandidates,
        } as IceStats
    }
}

export default StatsParser
