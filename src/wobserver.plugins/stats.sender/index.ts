import { StatsPayload } from '../../schema/sender.payload'
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
        const payload = {
            peerConnectionId: pcId,
            receiverStats: stats?.receiverStats,
            senderStats: stats?.senderStats
        } as StatsPayload

        await this.sendMessage(payload)
        return
    }

    private async sendMessage(payload?: StatsPayload): Promise<any> {
        if (!payload) {
            return
        }
        logger.warn('sending message to server', payload)
        this.webSocket?.send(JSON.stringify(payload))
    }
}

export default StatsSender
