import logger from '../../../observer.logger'
import ObserverPC, { IObserverStats } from '../../../observer.pc'
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

    private async getStats(sendRecvStats: RTCRtpSender[] | RTCRtpReceiver[]): Promise<any> {
        const statsList = []
        for (const currentStats of sendRecvStats) {
            const stats: any = await currentStats.getStats()
            for (const value of stats?.values()) {
                switch (value.type) {
                    case 'inbound-rtp':
                        logger.warn('->', value, StatsMap.inboundRTPStatElement(value))
                        statsList.push(StatsMap.inboundRTPStatElement(value))
                        break
                    case 'media-source':
                        logger.warn('->', value, StatsMap.mediaSource(value))
                        statsList.push(StatsMap.mediaSource(value))
                        break
                    case 'outbound-rtp':
                        logger.warn('->', value, StatsMap.outboundRTPStatElement(value))
                        statsList.push(StatsMap.outboundRTPStatElement(value))
                        break
                    case 'remote-inbound-rtp':
                        logger.warn('->', value, StatsMap.remoteInboundRTPStatElement(value))
                        statsList.push(StatsMap.remoteInboundRTPStatElement(value))
                        break
                    case 'track':
                        logger.warn('->', value, StatsMap.track(value))
                        statsList.push(StatsMap.remoteInboundRTPStatElement(value))
                        break
                }
            }
        }
        return statsList
    }

    private async getIceStats(receiverStats: any, senderStats: any): Promise<any> {
        const localCandidates = [
            ...receiverStats.filter( (item: any) => 'local-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'local-candidate' === item.type )]

        const remoteCandidates = [
            ...receiverStats.filter( (item: any) => 'remote-candidate' === item.type ),
            ...senderStats.filter( (item: any) => 'remote-candidate' === item.type )]

        const iceCandidatePair = [
            ...receiverStats.filter( (item: any) => 'candidate-pair' === item.type ),
            ...senderStats.filter( (item: any) => 'candidate-pair' === item.type )]


        logger.warn('$->', iceCandidatePair, StatsMap.candidatePair(iceCandidatePair) )
        logger.warn('$->', localCandidates, StatsMap.localCandidate(localCandidates) )
        logger.warn('$->', remoteCandidates, StatsMap.remoteCandidate(remoteCandidates) )
        return {
            iceCandidatePair: StatsMap.candidatePair(iceCandidatePair),
            localCandidates:  StatsMap.localCandidate(localCandidates),
            remoteCandidates: StatsMap.remoteCandidate(remoteCandidates),
        }
    }

    private filterStats(statsList: any): Promise<any> {
        return statsList.filter( (item: RTCStats) => !this.blackList.includes(item?.type) )
    }

}

export default StatsParser
