import ReconnectingWebSocket from 'reconnecting-websocket'
import logger from '../../observer.logger'
import ObserverPC from '../../observer.pc'
import { PeerConnectionSample } from '../../schema/sender.payload'
import { ObserverPluginBase } from '../base.plugin'


class StatsSender extends ObserverPluginBase {
    private readonly webSocket!: ReconnectingWebSocket
    constructor(serverAddress: string) {
        super()
        if (!serverAddress) {
            throw new Error('websocker server address is required')
        }
        const options = {
            connectionTimeout: 5000,
            maxEnqueuedMessages: 500,
            maxRetries: 50,
        }
        this.webSocket = new ReconnectingWebSocket(serverAddress, [], options)
    }

    async execute(observerPC: ObserverPC): Promise<any> {
        const samples: PeerConnectionSample = {

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
