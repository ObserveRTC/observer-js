import { ObserverPlugin } from '../observer.plugins/base.plugin'
import StatsParser from '../observer.plugins/stats.parser.plugin'
import ObserverBasePC from './base.pc'

export interface IUserConfig {
    pc: RTCPeerConnection
    callId?: string
    userId?: string
}

export interface IObserverStats {
    iceStats: any
    receiverStats: any
    senderStats: any
}


class ObserverPC extends ObserverBasePC {
    private readonly userConfig!: IUserConfig
    constructor(userConfig: IUserConfig) {
        super()
        this.userConfig = userConfig
    }

    public getPeerConnection(): RTCPeerConnection {
        return this.userConfig?.pc
    }

    public async run(pluginList: any[]) {
        for (const curPlugin of pluginList) {
            await this.runPlugin(curPlugin)
        }
    }

    protected async runPlugin(currentPlugin: ObserverPlugin) {
        const result = await currentPlugin?.execute(this)
        if (currentPlugin instanceof StatsParser && result) {
            this.statsDb.add(result)
        }
    }
}

export default ObserverPC
