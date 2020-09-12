import { Subscription } from 'rxjs'
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
    public readonly userConfig!: IUserConfig
    constructor(userConfig: IUserConfig) {
        super()
        this.userConfig = userConfig
    }

    protected async runPlugin(currentPlugin: ObserverPlugin) {
        const result = await currentPlugin?.execute(this)
        if (currentPlugin instanceof StatsParser && result) {
            this.statsDb.add(result)
        }
    }

    public getPeerConnection(): RTCPeerConnection {
        return this.userConfig?.pc
    }

    public async run(pluginList: any[]): Promise<any> {
        for (const curPlugin of pluginList) {
            await this.runPlugin(curPlugin)
        }
    }

    public addSubscription(subscription: Subscription): void {
        this.subscription = subscription
    }

    public removeSubscription(): void {
        this.subscription?.unsubscribe()
    }

    public dispose(): void {
        this.statsDb.clear()
        this.subscription?.unsubscribe()
    }
}

export default ObserverPC
