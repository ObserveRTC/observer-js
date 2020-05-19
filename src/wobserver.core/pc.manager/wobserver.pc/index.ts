import { Subscription } from 'rxjs'
import { IWobserverPlugin } from '../../../wobserver.plugins/iwobserver.plugin'

class WobserverPC {
    private readonly id!: string
    private pc!: RTCPeerConnection
    private subscriber: Subscription | undefined
    private plugins: IWobserverPlugin[] = []

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
        this.observer = this.observer.bind(this)
        this.resolveAsync = this.resolveAsync.bind(this)
    }

    public addSubscriber(subscriber: Subscription) {
        this.subscriber = subscriber
    }

    public removeSubscriber() {
        this.subscriber?.unsubscribe()
    }

    public attachPlugin(plugin: IWobserverPlugin) {
        this.plugins?.push(plugin)
    }

    public observer() {
        console.warn('working ', new Date(), this.id)
        this.resolveAsync().catch(err => {
            console.error(err)
        })
    }

    private async resolveAsync(): Promise<any> {
        const result = await this.plugins?.[0]?.execute(this.pc)
        console.warn('--->', result)
    }
}

export default WobserverPC
