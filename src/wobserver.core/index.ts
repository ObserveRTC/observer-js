import { Subscription } from 'rxjs'
import logger from '../wobserver.logger'
import { WobserverPlugin } from '../wobserver.plugins'
import IntervalWorker from './interval.worker'
import PCManager from './pc.manager'

class Wobserver {
    private pcManager: PCManager = new PCManager()
    private intervalWorker = new IntervalWorker(2000)
    private subscriber: Subscription | undefined

    public initialize() {
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
        this.subscriber = this.intervalWorker.subscribe(this.pcManager.worker.bind(this.pcManager))
    }

    public stopWorker() {
        this.intervalWorker.unsubscribe(this.subscriber)
    }

}

export default Wobserver
