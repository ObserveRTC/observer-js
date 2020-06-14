import { PeerConnectionSample } from '../../schema/sender.payload'
import WobserverPC from '../../wobserver.core/pc.manager/wobserver.pc'
import logger from '../../wobserver.logger'
import { WobserverPlugin } from '../index'

class StatsSender extends WobserverPlugin {
    private readonly webSocket!: WebSocket

    constructor(serverAddress: string) {
        super()
        if (!serverAddress) {
            throw new Error('websocker server address is required')
        }
        this.webSocket = new WebSocket(serverAddress)
    }

    async execute(pc: WobserverPC): Promise<any> {
        const stats = pc.getStatsQueue().pool()
        const pcId = pc.getPcId()
        const samples = {
            iceStats : stats?.iceStats,
            peerConnectionId: pcId,
            receiverStats: stats?.receiverStats,
            senderStats: stats?.senderStats,
        } as PeerConnectionSample

        await this.sendMessage(samples)
        return
    }

    private async sendMessage(samples?: PeerConnectionSample): Promise<any> {
        if (!samples) {
            return
        }
        logger.warn('sending samples to server', samples)
        this.webSocket?.send(JSON.stringify(samples))
    }
}

export default StatsSender
