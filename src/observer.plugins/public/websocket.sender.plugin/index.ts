import ReconnectingWebSocket from 'reconnecting-websocket'
import logger from '../../../observer.logger'
import ObserverPC from '../../../observer.pc'
import TimeUtil from '../../../observer.utils/time.util'
import { PeerConnectionSample } from '../../../schema/v20200114'
import { ObserverPlugin } from '../../base.plugin'


class StatsSender extends ObserverPlugin {
    private readonly webSocket!: ReconnectingWebSocket
    constructor(serverAddress: string) {
        super()
        if (!serverAddress) {
            throw new Error('websocker server address is required')
        }
        const options = {
            connectionTimeout: 5000,
            debug: true,
            maxEnqueuedMessages: 500,
            maxRetries: 50,
        }
        this.webSocket = new ReconnectingWebSocket(serverAddress, [], options)
    }

    public async execute(observerPC: ObserverPC): Promise<any> {
        const stats = observerPC?.statsDb?.pool()
        const samples: PeerConnectionSample = {
            browserId: observerPC?.browserId,
            callId: observerPC?.userConfig?.callId,
            iceStats: stats?.iceStats,
            peerConnectionId: observerPC?.id,
            receiverStats: stats?.receiverStats,
            senderStats: stats?.senderStats,
            timeZoneOffsetInMinute: observerPC?.timeZoneOffsetInMinute,
            timestamp: TimeUtil.getCurrent(),
            userId: observerPC?.userConfig?.userId
        } as PeerConnectionSample
        await this.sendMessage(samples)
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
