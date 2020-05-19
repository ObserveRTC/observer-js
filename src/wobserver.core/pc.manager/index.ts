import { v4 as uuidv4 } from 'uuid'
import logger from '../../wobserver.logger'
import { WobserverPlugin } from '../../wobserver.plugins'
import WobserverPC from './wobserver.pc'

class PCManager {
    private pcList: WobserverPC[] = []
    public addPC(pc: RTCPeerConnection) {
        const curPC = new WobserverPC(uuidv4(), pc)
        this.pcList.push(curPC)
    }

    public attachPlugin(plugin: WobserverPlugin) {
        for (const curPc of this.pcList) {
            curPc.attachPlugin(plugin)
        }
    }

    public worker() {
        for (const curPc of this.pcList) {
            curPc.execute().catch(err => logger.error(err))
        }
    }
}

export default PCManager
