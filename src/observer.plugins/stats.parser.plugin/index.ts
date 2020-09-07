import ObserverPC, { IObserverStats } from '../../observer.pc'
import { ObserverPlugin } from '../base.plugin'


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
                statsList.push(value)
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
        return {
            iceCandidatePair,
            localCandidates,
            remoteCandidates,
        }
    }

    private filterStats(statsList: any): Promise<any> {
        return statsList.filter( (item: RTCStats) => !this.blackList.includes(item?.type) )
    }

}

export default StatsParser
