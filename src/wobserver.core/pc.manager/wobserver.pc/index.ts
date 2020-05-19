import { WobserverPlugin } from '../../../wobserver.plugins'

class WobserverPC {
    private readonly id!: string
    private readonly pc!: RTCPeerConnection
    private plugins: WobserverPlugin[] = []

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
    }

    public attachPlugin(plugin: WobserverPlugin) {
        this.plugins?.push(plugin)
    }

    public async execute(): Promise<any> {
        console.warn('->', this.id)
        /*for (const curPlugin of this.plugins) {
            const result = await curPlugin?.execute(this.pc)
            console.warn('--->', result)
        }*/
    }
}

export default WobserverPC
