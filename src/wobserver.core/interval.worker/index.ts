import { interval, Observable, Subscription } from 'rxjs'
import { IIntervalWorker } from './interface/index'

class IntervalWorker implements IIntervalWorker {
    private observable!: Observable<number>

    public IntervalWorker(intervalInMs: number = 1000) {
        this.observable = interval(intervalInMs)
    }

    public subscribe(observer: any): Subscription {
        const subscription = this.observable.subscribe(observer)
        return subscription
    }

    public unsubscribe(subscriber: Subscription): void {
        subscriber?.unsubscribe()
    }

}

export default IntervalWorker
