import IntervalWorker from '../observer.interval.worker'
import logger from '../observer.logger'
import ObserverPC, { IUserConfig } from '../observer.pc'
import { ObserverPlugin } from '../observer.plugins/base.plugin'
import ConnectionMonitor from '../observer.plugins/internal/connection.monitor.plugin'
import StatsSender from '../observer.plugins/public/websocket.sender.plugin'
import UserMediaHandler from '../observer.usermediahandler'

abstract class IObserver {
    public abstract addPC(pc: RTCPeerConnection, callId?: string, userId?: string): void
    public abstract resumePC(currentPC: ObserverPC): void
    public abstract pausePC(currentPC: ObserverPC): void
    public abstract attachPlugin(plugin: ObserverPlugin): void
    public abstract disposePC(currentPC: ObserverPC): void
    public abstract getPcList(): ObserverPC[]
    public abstract sendUserMediaError(errorMessage?: string): void
}

class Observer implements IObserver {
    private pcList: ObserverPC[] = []
    private pluginList: ObserverPlugin[] = [
        // internal plugins
        new ConnectionMonitor(),
    ]
    private intervalWorker: IntervalWorker
    private userMediaHandler: UserMediaHandler = new UserMediaHandler()

    constructor(poolingInterval: number = 1000) {
        // @ts-ignore
        console.info('using library version', LIBRARY_VERSION)
        this.intervalWorker   = new IntervalWorker(poolingInterval)
        this.userMediaHandler.overrideUserMedia(this)
    }

    public attachPlugin(plugin: ObserverPlugin): void {
        if ( this.pluginList.find(item => item.id === plugin.id) ) {
            logger.warn('this plugin already attached. omitting re-adding!')
            return
        }
        this.pluginList.push(plugin)
    }

    public addPC(pc: RTCPeerConnection, callId?: string, userId?: string) {
        const userConfig = {
            callId,
            pc,
            userId
        } as IUserConfig
        const currentPC = new ObserverPC(userConfig)
        this.pcList.push( currentPC )
        // call private subscribe manager
        this.subscribe(currentPC)
    }

    public resumePC(currentPC: ObserverPC): void {
        // call private subscribe manager
        this.subscribe(currentPC)
    }

    public pausePC(currentPC: ObserverPC): void {
        currentPC?.dispose()
    }

    public disposePC(currentPC?: ObserverPC) {
        if (currentPC) {
            currentPC.dispose()
            this.pcList = this.pcList.filter( (pc: ObserverPC) => pc.id !== currentPC.id )
            return
        }
        for (const currentPc of this.pcList) {
            currentPc.dispose()
        }
        this.pcList = []
    }

    public getPcList(): ObserverPC[] {
        return this.pcList
    }

    public sendUserMediaError(errorMessage?: string) {
        const currentPlugin = this.pluginList.find((plugin: ObserverPlugin) =>  plugin instanceof StatsSender )
        if (currentPlugin) {
            const senderPlugin = currentPlugin as StatsSender
            senderPlugin.sendUserMediaError(errorMessage).catch(null)
        }
    }

    // private helper method
    private subscribe(currentPC: ObserverPC) {
        // is already subscribed
        if (currentPC.subscription) {
            logger.warn('already subscribed. disposing first and resuming', currentPC?.id)
            this.disposePC(currentPC)
        }
        const worker = currentPC.run.bind(currentPC, this.pluginList)
        const currentSubscriber = this.intervalWorker.subscribe(worker)
        currentPC.addSubscription(currentSubscriber)
    }
}

export default Observer
