import { Subscription } from 'rxjs'
import { ObserverPlugin } from '../observer.plugins/base.plugin'
import StatsParser from '../observer.plugins/public/stats.parser.plugin'
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
    public readonly userConfig!: IUserConfig
    constructor(userConfig: IUserConfig) {
        super()
        this.userConfig = userConfig
    }

    protected async runPlugin(currentPlugin: ObserverPlugin) {
        const result = await currentPlugin?.execute(this)
        if (currentPlugin instanceof StatsParser && result) {
            this.collectStatsDb.add(result)
        }
    }

    public getPeerConnection(): RTCPeerConnection {
        return this.userConfig?.pc
    }

    public async run(pluginList: any[]): Promise<any> {
        // run through all plugins
        for (const curPlugin of pluginList) {
            await this.runPlugin(curPlugin)
        }
    }

    public addSubscription(subscription: Subscription): void {
        this.subscription = subscription
    }

    public removeSubscription(): void {
        this.subscription?.unsubscribe()
        this.subscription = undefined
    }

    public dispose(): void {
        this.removeSubscription()
        this.collectStatsDb.clear()
        this.sendStatsDB.clear()
    }
}

export default ObserverPC
