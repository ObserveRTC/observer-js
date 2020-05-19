import { WobserverPlugin } from '../../../wobserver.plugins'

class WobserverPC {
    private readonly id!: string
    private readonly pc!: RTCPeerConnection

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
    }

    public async execute(pluginList: WobserverPlugin[]): Promise<any> {
        for (const curPlugin of pluginList) {
            const result = await curPlugin?.execute(this.pc)
            console.warn('--->', result)
        }
    }
}

export default WobserverPC
