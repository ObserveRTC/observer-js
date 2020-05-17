import { Subscription } from 'rxjs'

export interface IIntervalWorker {
    subscribe(observer: any): Subscription

    unsubscribe(subscriber: Subscription): void
}
