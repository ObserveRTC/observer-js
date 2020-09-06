import { interval, Observable, Subscription } from 'rxjs'

class IntervalWorker {
    private observable!: Observable<number>
    private readonly minInterval = 500
    private readonly maxInterval = 300 * 1000
    constructor(intervalInMs: number = 1000) {
        intervalInMs = Math.min(Math.max(intervalInMs, this.minInterval), this.maxInterval)
        this.observable = interval(intervalInMs)
    }

    public subscribe(observer: any): Subscription {
        const subscription = this.observable.subscribe(observer)
        return subscription
    }

    public unsubscribe(subscriber?: Subscription): void {
        subscriber?.unsubscribe()
    }
}

export default IntervalWorker
