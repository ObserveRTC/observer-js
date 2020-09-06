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

    public async runPlugins(pluginList: any[]) {
        for (const curPlugin of pluginList) {
            await this.runPlugin(curPlugin)
        }
    }
}

export default ObserverPC
