import IntervalWorker from '../observer.interval.worker'
import logger from '../observer.logger'
import ObserverPC, { IUserConfig } from '../observer.pc'
import { ObserverPlugin } from '../observer.plugins/base.plugin'

abstract class IObserverManager {
    public abstract addPC(pc: RTCPeerConnection, callId: string, userId: string): void
    public abstract resumePC(currentPC: ObserverPC): void
    public abstract attachPlugin(plugin: ObserverPlugin): void
    public abstract dispose(currentPC: ObserverPC): void
    public abstract getPcList(): ObserverPC[]
}

class ObserverManager implements IObserverManager{
    private pcList: ObserverPC[] = []
    private pluginList: ObserverPlugin[] = []
    // @ts-ignore
    private intervalWorker: IntervalWorker = new IntervalWorker(parseInt(POOLING_INTERVAL_MS, 10))

    constructor() {
        // @ts-ignore
        console.info('using library version', LIBRARY_VERSION)
    }

    public attachPlugin(plugin: ObserverPlugin): void {
        if ( this.pluginList.find(item => item.id === plugin.id) ) {
            logger.warn('this plugin already attached. omitting re-adding!')
            return
        }
        this.pluginList.push(plugin)
    }

    public addPC(pc: RTCPeerConnection, callId: string, userId: string) {
        const userConfig = {
            callId,
            pc,
            userId
        } as IUserConfig
        const currentPC = new ObserverPC(userConfig)
        this.pcList.push( currentPC )
        this.subscribe(currentPC)
    }

    public resumePC(currentPC: ObserverPC): void {
        this.subscribe(currentPC)
    }

    public dispose(currentPC?: ObserverPC) {
        if (currentPC) {
            currentPC.dispose()
            return
        }
        for (const currentPc of this.pcList) {
            currentPc.dispose()
        }
    }

    public getPcList(): ObserverPC[] {
        return this.pcList
    }

    // private helper method
    private subscribe(currentPC: ObserverPC) {
        const worker = currentPC.run.bind(currentPC, this.pluginList)
        const currentSubscriber = this.intervalWorker.subscribe(worker)
        currentPC.addSubscription(currentSubscriber)
    }

}

export default ObserverManager
