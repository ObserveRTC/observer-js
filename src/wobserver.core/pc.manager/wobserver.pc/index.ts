import { WobserverPlugin } from '../../../wobserver.plugins'

class WobserverPC {
    private readonly id!: string
    private readonly pc!: RTCPeerConnection

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
    }

    public getPc() {
        return this.pc
    }

    public async execute(pluginList: WobserverPlugin[]): Promise<any> {
        for (const curPlugin of pluginList) {
            const result = await curPlugin?.execute(this)
            console.warn('--->', result)
        }
    }
}

export default WobserverPC
