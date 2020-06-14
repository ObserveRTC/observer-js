import WobserverPC from '../../wobserver.core/pc.manager/wobserver.pc'
import { WobserverPlugin } from '../index'

class StatsParser extends WobserverPlugin {
    private readonly blackList = ['certificate', 'codec', 'transport', 'local-candidate', 'remote-candidate', 'candidate-pair'] as string[]
    public async execute(wobserverPC: WobserverPC): Promise<any> {
        const [rawReceiverStats, rawSenderStats] = await Promise.all([
            this.receiverStats(wobserverPC?.getPc()),
            this.senderStats(wobserverPC?.getPc())
        ])
        const iceStats = await this.getIceStats(rawReceiverStats, rawSenderStats)
        const receiverStats = await this.filterStats(rawReceiverStats)
        const senderStats = await this.filterStats(rawSenderStats)

        return {
            iceStats,
            receiverStats,
            senderStats,
        }
    }

    private async receiverStats(pc: RTCPeerConnection): Promise<any> {
        const receivers = pc?.getReceivers()
        if (!receivers) {
            return
        }
        const statsList = []
        for (const curReceiver of receivers) {
            const stats: any = await curReceiver.getStats()
            for (const value of stats?.values()) {
                statsList.push(value)
            }
        }
        return statsList
    }

    private async senderStats(pc: RTCPeerConnection): Promise<any> {
        const senders = pc?.getSenders()
        if (!senders) {
            return
        }
        const statsList = []
        for (const curSender of senders) {
            const stats: any = await curSender.getStats()
            for (const value of stats?.values()) {
                statsList.push(value)
            }
        }
        return statsList
    }

    private async getIceStats(receiverStats: any, senderStats: any): Promise<any> {
        const localCandidates = receiverStats.filter( (item: any) => 'local-candidate' === item.type )
        const remoteCandidates = receiverStats.filter( (item: any) => 'remote-candidate' === item.type )
        const iceCandidatePair = receiverStats.filter( (item: any) => 'candidate-pair' === item.type )
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
