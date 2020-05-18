import logger from '../wobserver.logger'
import { IWobserverPlugin } from '../wobserver.plugins/iwobserver.plugin'
import IntervalWorker from './interval.worker'
import PCManager from './pc.manager'

class Wobserver {
    private pcManager: PCManager = new PCManager()
    private intervalWorker = new IntervalWorker()

    public initialize() {
        // todo add more logic here
        logger.info('initialized')
    }

    public addPC(pc: RTCPeerConnection): void {
        this.pcManager.addPC(pc, this.intervalWorker)
    }

    public addPlugin(plugin: IWobserverPlugin): void {
        this.pcManager.attachPlugin(plugin)
    }

}

export default Wobserver
