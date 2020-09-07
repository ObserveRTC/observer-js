import { Subscription } from 'rxjs'
import IntervalWorker from '../observer.interval.worker'
import logger from '../observer.logger'
import ObserverPC, { IUserConfig } from '../observer.pc'
import { ObserverPlugin } from '../observer.plugins/base.plugin'

abstract class IObserverManager {
    public abstract addPC(pc: RTCPeerConnection, callId: string, userId: string): void
    public abstract attachPlugin(plugin: ObserverPlugin): void
}

class ObserverManager implements IObserverManager{
    private pcList: ObserverPC[] = []
    private pluginList: ObserverPlugin[] = []
    // @ts-ignore
    private intervalWorker: IntervalWorker = new IntervalWorker(parseInt(POOLING_INTERVAL_MS, 10))
    private subscribeList: Subscription[] = []

    constructor() {
        // @ts-ignore
        console.info('using library version', LIBRARY_VERSION)
    }

    public addPC(pc: RTCPeerConnection, callId: string, userId: string) {
        const userConfig = {
            callId,
            pc,
            userId
        } as IUserConfig
        const currentPC = new ObserverPC(userConfig)
        this.pcList.push( currentPC )
    }

    public attachPlugin(plugin: ObserverPlugin): void {
        if ( this.pluginList.find(item => item.id === plugin.id) ) {
            logger.warn('this plugin already attached. omitting re-adding!')
            return
        }
        this.pluginList.push(plugin)
    }

    private subscribe(currentPC: ObserverPC) {
        const worker = currentPC.run.bind(currentPC)
        const currentSubscriber = this.intervalWorker.subscribe(worker)
    }

    private unSubscribe(currentPC: ObserverPC) {
    }

}

export default ObserverManager
