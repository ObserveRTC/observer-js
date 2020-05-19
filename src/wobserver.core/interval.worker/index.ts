import { interval, Observable, Subscription } from 'rxjs'

class IntervalWorker {
    private observable!: Observable<number>

    constructor(intervalInMs: number = 1000) {
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
