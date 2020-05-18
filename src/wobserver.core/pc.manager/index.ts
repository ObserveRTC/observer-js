import { v4 as uuidv4 } from 'uuid'
import { IWobserverPlugin } from '../../wobserver.plugins/iwobserver.plugin'
import IntervalWorker from '../interval.worker/index'
import WobserverPC from './wobserver.pc'

class PCManager {
    private pcList: WobserverPC[] = []

    public addPC(pc: RTCPeerConnection, intervalWorker: IntervalWorker) {
        const curPC = new WobserverPC(uuidv4(), pc)
        const subscription = intervalWorker?.subscribe(curPC.observer)
        curPC.addSubscriber(subscription)
        this.pcList.push(curPC)
    }

    public attachPlugin(plugin: IWobserverPlugin) {
        for (const curPc of this.pcList) {
            curPc.attachPlugin(plugin)
        }
    }
}

export default PCManager
