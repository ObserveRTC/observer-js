import { Subscription } from 'rxjs'
import { WobserverPlugin } from '../wobserver.plugins'
import IntervalWorker from './interval.worker'
import PCManager from './pc.manager'
import WobserverPC from './pc.manager/wobserver.pc'

class Wobserver {
    private pcManager: PCManager = new PCManager()
    // @ts-ignore
    private intervalWorker = new IntervalWorker(parseInt(POOLING_INTERVAL_MS, 10))
    private subscriberList: Subscription[]

    constructor() {
        // @ts-ignore
        console.info('using library version', LIBRARY_VERSION)
        this.subscriberList = []
    }

    public addPC(pc: RTCPeerConnection, callId?: string, userId?: string): void {
        this.pcManager.addPC(pc, callId, userId)
    }

    public removePC(pc: WobserverPC): void {
        this.pcManager.removePC(pc)
    }

    public getPCList(): WobserverPC[] {
        return this.pcManager.getPCList()
    }

    public attachPlugin(plugin: WobserverPlugin): void {
        this.pcManager.attachPlugin(plugin)
    }

    public dispose() {
        for (const currentSubscriber of this.subscriberList) {
            this.intervalWorker.unsubscribe(currentSubscriber)
        }
        this.pcManager.dispose()
    }

}

export default Wobserver
