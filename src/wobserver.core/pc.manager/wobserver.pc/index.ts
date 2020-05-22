import logger from '../../../wobserver.logger'
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

    public async execute(pluginList: WobserverPlugin[]): Promise<any> {
        for (const curPlugin of pluginList) {
            const result = await curPlugin?.execute(this)
            if (result && curPlugin instanceof StatsParser) {
                this.statsQueue.add(result)
                console.warn(result)
            } else {
                logger.warn('ignore plugin execution. something is not right!')
            }
        }
    }

    public getStats(): any {
        return this.statsQueue.pool()
    }
}

export default WobserverPC
