import logger from '../wobserver.logger'
import { IWobserverPlugin } from '../wobserver.plugins/iwobserver.plugin'
import StatsParser from './../wobserver.plugins/stats.parser/index'
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

    public addPluginManual(): void {
        const statsParser = new StatsParser()
        this.pcManager.attachPlugin(statsParser)
    }

}

export default Wobserver
