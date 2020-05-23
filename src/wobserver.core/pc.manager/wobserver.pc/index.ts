import { WobserverPlugin } from '../../../wobserver.plugins'
import StatsParser from '../../../wobserver.plugins/stats.parser'
import Queue from '../../wobserver.datastructure/queue'

class WobserverPC {
    private readonly id!: string
    private readonly pc!: RTCPeerConnection
    private readonly statsQueue = new Queue()

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
    }

    public getPc() {
        return this.pc
    }

    public getPcId() {
        return this.id
    }

    public getStatsQueue() {
        return this.statsQueue
    }

    public async execute(pluginList: WobserverPlugin[]): Promise<any> {
        for (const curPlugin of pluginList) {
            const result = await curPlugin?.execute(this)
            if (curPlugin instanceof StatsParser && result) {
                this.statsQueue.add(result)
            }
        }
    }
    public dispose() {
        this.statsQueue.clear()
    }
}

export default WobserverPC
