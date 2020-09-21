import logger from '../../../observer.logger'
import ObserverPC, { IObserverStats } from '../../../observer.pc'
import { IceStats, ReceiverStats } from '../../../schema/v20200114'
import StatsMap from '../../../schema/v20200114/stats.map'
import { ObserverPlugin } from '../../base.plugin'


class StatsParser extends ObserverPlugin {
    private readonly blackList = [
        'certificate', 'codec', 'transport', 'local-candidate', 'remote-candidate', 'candidate-pair'] as string[]

    public async execute(observerPC: ObserverPC): Promise<IObserverStats> {
        const [rawReceiverStats, rawSenderStats] = await Promise.all([
            this.receiverStats(observerPC?.getPeerConnection()),
            this.senderStats(observerPC?.getPeerConnection())
        ])
        const iceStats = await this.getIceStats(rawReceiverStats, rawSenderStats)
        const receiverStats = await this.filterStats(rawReceiverStats)
        const senderStats = await this.filterStats(rawSenderStats)
        return {
            iceStats,
            receiverStats,
            senderStats,
        } as IObserverStats
    }

    private async receiverStats(pc: RTCPeerConnection): Promise<any> {
        const receivers = pc?.getReceivers()
        if (!receivers) {
            return
        }
        return this.getStats(receivers)
    }

    private async senderStats(pc: RTCPeerConnection): Promise<any> {
        const senders = pc?.getSenders()
        if (!senders) {
            return
        }
        return this.getStats(senders)
    }

    private async getStats(sendRecvStats: RTCRtpSender[] | RTCRtpReceiver[]): Promise<ReceiverStats> {
        const statsList = []
        for (const currentStats of sendRecvStats) {
            const stats: any = await currentStats.getStats()
            for (const value of stats?.values()) {
                statsList.push(value)
            }
        }
        const inboundRTPStats = statsList.filter(stats => stats?.value === 'inbound-rtp')
            .map(stats => StatsMap.inboundRTPStatElement(stats))
        const mediaSources = statsList.filter(stats => stats?.value === 'media-source')
            .map(stats => StatsMap.mediaSource(stats))
        const outboundRTPStats = statsList.filter(stats => stats?.value === 'outbound-rtp')
            .map(stats => StatsMap.outboundRTPStatElement(stats))
        const remoteInboundRTPStats = statsList.filter(stats => stats?.value === 'remote-inbound-rtp')
            .map(stats => StatsMap.remoteInboundRTPStatElement(stats))
        const tracks = statsList.filter(stats => stats?.value === 'track')
            .map(stats => StatsMap.track(stats))

        return {
            inboundRTPStats,
            mediaSources,
            outboundRTPStats,
            remoteInboundRTPStats,
            tracks
        } as ReceiverStats
    }

    private async getIceStats(receiverStats: any, senderStats: any): Promise<IceStats> {
        const localCandidates = [
            ...receiverStats.filter( (item: any) => 'local-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'local-candidate' === item.type )]
            .map( stats => StatsMap.localCandidate(stats) )

        const remoteCandidates = [
            ...receiverStats.filter( (item: any) => 'remote-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'remote-candidate' === item.type ) ]
            .map( stats => StatsMap.remoteCandidate(stats) )

        const candidatePairs = [
            ...receiverStats.filter( (item: any) => 'candidate-pair' === item.type ),
            ...senderStats.filter( (item: any) => 'candidate-pair' === item.type ) ]
            .map( stats => StatsMap.candidatePair(stats) )

        return {
            candidatePairs,
            localCandidates,
            remoteCandidates,
        } as IceStats
    }

    private filterStats(statsList: any): Promise<any> {
        return statsList.filter( (item: RTCStats) => !this.blackList.includes(item?.type) )
    }

}

export default StatsParser
