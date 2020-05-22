import { Subscription } from 'rxjs'
import logger from '../wobserver.logger'
import { WobserverPlugin } from '../wobserver.plugins'
import IntervalWorker from './interval.worker'
import PCManager from './pc.manager'

class Wobserver {
    private pcManager: PCManager = new PCManager()
    private intervalWorker = new IntervalWorker(1000)
    private subscriber: Subscription | undefined

    constructor() {
        // todo add more logic here
        logger.debug('initialized')
    }

    public addPC(pc: RTCPeerConnection): void {
        this.pcManager.addPC(pc)
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

}

export default Wobserver
