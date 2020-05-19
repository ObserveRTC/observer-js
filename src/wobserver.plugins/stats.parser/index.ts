import { WobserverPlugin } from '../index'

class StatsParser extends WobserverPlugin {

    public async receiveStats(sample: any): Promise<any> {
        // not implemented
    }
    public async execute(pc: RTCPeerConnection): Promise<any> {
        const receiverStats = await this.receiverStats(pc)
        const senderStats = await this.senderStats(pc)
        return {
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

}

export default StatsParser
