import { IWobserverPlugin } from '../iwobserver.plugin'

class StatsParser implements IWobserverPlugin{
    receiveStats(sample: any): void {
        // not implemented
    }

    async execute(pc: RTCPeerConnection): Promise<any> {
        const receiverStats = await this.receiverStats(pc)
        const senderStats = await this.senderStats(pc)
        return {
            receiverStats,
            senderStats,
        }
    }

    private async receiverStats(pc: RTCPeerConnection) {
        const receivers = pc?.getReceivers()
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
        const statsList = []
        for (const curSender of senders) {
            const stats: any = await curSender.getStats()
            for (const value of stats?.values()) {
                statsList.push(value)
            }
        }
        return statsList
    }

}

export default StatsParser
