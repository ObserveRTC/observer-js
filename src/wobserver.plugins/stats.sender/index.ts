import ReconnectingWebSocket from 'reconnecting-websocket'
import { PeerConnectionSample } from '../../schema/sender.payload'
import WobserverPC from '../../wobserver.core/pc.manager/wobserver.pc'
import logger from '../../wobserver.logger'
import { WobserverPlugin } from '../index'


class StatsSender extends WobserverPlugin {
    private readonly webSocket!: ReconnectingWebSocket
    constructor(serverAddress: string) {
        super()
        if (!serverAddress) {
            throw new Error('websocker server address is required')
        }
        const options = {
            connectionTimeout: 5000,
            maxEnqueuedMessages: 1000,
            maxRetries: 50,
        }
        this.webSocket = new ReconnectingWebSocket(serverAddress, [], options)
    }

    async execute(pc: WobserverPC): Promise<any> {
        const stats = pc.getStatsQueue().pool()
        const pcId = pc.getPcId()
        const browserId = pc.getBrowserId()
        const callId = pc.getCallId()
        const userId = pc.getUserId()
        const timeZoneOffsetInMinute = pc.getTimeZoneOffsetInMinute()
        const samples = {
            browserId,
            callId,
            iceStats : stats?.iceStats,
            peerConnectionId: pcId,
            receiverStats: stats?.receiverStats,
            senderStats: stats?.senderStats,
            timeZoneOffsetInMinute,
            userId,
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
