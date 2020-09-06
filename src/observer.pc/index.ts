import ObserverBasePC from './base.pc'

export interface IUserConfig {
    pc: RTCPeerConnection
    callId?: string
    userId?: string
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
}

export default ObserverPC
