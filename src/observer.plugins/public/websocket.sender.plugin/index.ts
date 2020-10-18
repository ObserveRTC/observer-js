import ReconnectingWebSocket from 'reconnecting-websocket'
import logger from '../../../observer.logger'
import ObserverPC from '../../../observer.pc'
import observerSingleton from '../../../observer.singleton'
import TimeUtil from '../../../observer.utils/time.util'
import { PeerConnectionSample, UserMediaError } from '../../../schema/v20200114'
import { ObserverPlugin } from '../../base.plugin'
import SenderOptimizer from './stats.sender.optimize'


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
        const previousStats = observerPC?.sendStatsDB?.pool()
        const currentStats = observerPC?.collectStatsDb?.pool()
        // apply plugin specific sender optimization
        const stats = SenderOptimizer.getStatsForSending(previousStats, currentStats)
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
        // add last sent stats
        observerPC.sendStatsDB.add(currentStats)
        await this.sendMessage(samples)
    }

    public async sendUserMediaError(errorMessage?: string) {
        logger.warn('yaaa!', errorMessage)
        const sample: PeerConnectionSample = {
            browserId: await observerSingleton.getBrowserId(),
            timeZoneOffsetInMinute: TimeUtil.getTimeZoneOffsetInMinute(),
            timestamp: TimeUtil.getCurrent(),
            userMediaErrors: [{ message: errorMessage } as UserMediaError]
        } as PeerConnectionSample
        await this.sendMessage(sample)
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
