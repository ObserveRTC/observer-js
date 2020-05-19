import { v4 as uuidv4 } from 'uuid'
import logger from '../../wobserver.logger'
import { WobserverPlugin } from '../../wobserver.plugins'
import WobserverPC from './wobserver.pc'

class PCManager {
    private pcList: WobserverPC[] = []
    private plugins: WobserverPlugin[] = []

    public addPC(pc: RTCPeerConnection) {
        const curPC = new WobserverPC(uuidv4(), pc)
        this.pcList.push(curPC)
    }

    public attachPlugin(plugin: WobserverPlugin) {
        // if this plugin already attached omit
        if ( this.plugins.find(item => item.id === plugin.id) ) {
            logger.warn('this plugin already attached. omitting re-adding!')
            return
        }
        this.plugins.push(plugin)
    }

    public worker() {
        for (const curPc of this.pcList) {
            curPc.execute(this.plugins).catch(err => logger.error(err))
        }
    }
}

export default PCManager
