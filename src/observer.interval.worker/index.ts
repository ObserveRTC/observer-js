import { interval, Observable, Subscription } from 'rxjs'

class IntervalWorker {
    private observable!: Observable<number>
    private readonly minIntervalInMs = 500
    private readonly maxIntervalInMs = 300000 // 5 minutes
    constructor(intervalInMs: number = 1000) {
        intervalInMs = Math.max(this.minIntervalInMs, intervalInMs)
        intervalInMs = Math.min(this.maxIntervalInMs, intervalInMs)
            this.observable = interval(intervalInMs)
    }

    public subscribe(observer: any): Subscription {
        const subscription = this.observable.subscribe(observer)
        return subscription
    }

    public unsubscribe(subscriber?: Subscription) {
        subscriber?.unsubscribe()
    }
}

export default IntervalWorker
