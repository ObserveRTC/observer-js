import { Subscription } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'
import IntervalWorker from '../interval.worker/index'
import WobserverPC from './wobserver.pc'

class PCManager {
    private readonly intervalWorker: IntervalWorker = new IntervalWorker()
    private readonly pcList!: WobserverPC[]

    public addPC(pc: RTCPeerConnection) {
        const curPC = new WobserverPC(uuidv4(), pc)
        const subscription = this.intervalWorker.subscribe(curPC.observer)
        curPC.addSubscriber(subscription)
        this.pcList.push(curPC)
    }
}

export default PCManager
