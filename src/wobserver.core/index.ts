import { Subscription } from 'rxjs'
import { WobserverPlugin } from '../wobserver.plugins'
import IntervalWorker from './interval.worker'
import PCManager from './pc.manager'
import WobserverPC from './pc.manager/wobserver.pc'

class Wobserver {
    private pcManager: PCManager = new PCManager()
    // @ts-ignore
    private intervalWorker = new IntervalWorker(parseInt(POOLING_INTERVAL_MS, 10))
    private subscriber: Subscription | undefined

    constructor() {
        // @ts-ignore
        console.info('using library version', LIBRARY_VERSION)
    }

    public addPC(pc: RTCPeerConnection): void {
        this.pcManager.addPC(pc)
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

    public startWorker() {
        // remove any existing running worker
        this.stopWorker()

        const worker = this.pcManager.worker.bind(this.pcManager)
        this.subscriber = this.intervalWorker.subscribe(worker)
    }

    public stopWorker() {
        this.intervalWorker.unsubscribe(this.subscriber)
    }

    public dispose() {
        this.stopWorker()
        this.pcManager.dispose()
    }

}

export default Wobserver
