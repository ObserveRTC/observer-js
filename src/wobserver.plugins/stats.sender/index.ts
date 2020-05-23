import WobserverPC from '../../wobserver.core/pc.manager/wobserver.pc'
import logger from '../../wobserver.logger'
import { WobserverPlugin } from '../index'

const webSocketAddress = 'ws://localhost:8080/ws/demo/86ed98c6-b001-48bb-b31e-da638b979c72'

class StatsSender extends WobserverPlugin{
    private readonly webSocket!: WebSocket
    constructor() {
        super()
        this.webSocket = new WebSocket(webSocketAddress)
    }

    async execute(pc: WobserverPC): Promise<any> {
        const stats = pc.getStatsQueue().pool()
        console.warn('->', stats)
        return Promise.resolve(undefined)
    }

    private async sendMessage(payload?: any): Promise<any> {
        if (!payload) {
            return
        }
        logger.warn('sending message to server')
        this.webSocket?.send(payload)
    }
}

export default StatsSender
