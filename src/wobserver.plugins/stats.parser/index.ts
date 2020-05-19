import { IWobserverPlugin } from '../iwobserver.plugin'

class StatsParser implements IWobserverPlugin{
    receiveStats(sample: any): void {
        // not implemented
    }

    async execute(pc: RTCPeerConnection): Promise<any> {
        const senderStats = await this.senderStats(pc)
        const receiverStats = await this.receiverStats(pc)
    }


    private async senderStats(pc: RTCPeerConnection) {
        const senders = pc?.getSenders()
        for (const curSender of senders) {
            const stats: any = await curSender.getStats()
            for (const [key, value] of stats?.entries()) {
                console.warn('->', 'sender stats', key, value)
            }
        }
    }

    private async receiverStats(pc: RTCPeerConnection) {
        const receivers = pc?.getReceivers()
        for (const curReceiver of receivers) {
            const stats: any = await curReceiver.getStats()
            for (const [key, value] of stats?.entries()) {
                console.warn('->', 'sender stats', key, value)
            }
        }
    }

}

export default StatsParser
