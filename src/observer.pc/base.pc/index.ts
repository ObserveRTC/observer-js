import { Subscription } from 'rxjs'
import { v4 as uuidv4 } from 'uuid'
import Queue from '../../observer.db/in.memory.queue'
import observerSingleton from '../../observer.singleton'
import TimeUtil from '../../observer.utils/time.util'
import PCState from '../pc.state'

export default abstract class ObserverBasePC {
    public readonly id: string = uuidv4()
    public readonly timeZoneOffsetInMinute: number = TimeUtil.getTimeZoneOffsetInMinute()
    public subscription?: Subscription
    public statsDb: Queue = new Queue()
    public browserId?: string
    public pcState: PCState = new PCState()
    protected constructor() {
        observerSingleton.getBrowserId().then(value => this.browserId = value)
    }

    public abstract getPeerConnection(): RTCPeerConnection
    public abstract addSubscription(subscription: Subscription): void
    public abstract removeSubscription(): void
    public abstract dispose(): void
    public abstract async run(pluginList: any[]): Promise<any>

}
