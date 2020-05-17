import { Subscription } from 'rxjs'

class WobserverPC {
    private readonly id!: string
    private pc!: RTCPeerConnection
    private subscriber: Subscription | undefined

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
        this.observer = this.observer.bind(this)
    }

    public addSubscriber(subscriber: Subscription) {
        this.subscriber = subscriber
    }

    public removeSubscriber() {
        this.subscriber?.unsubscribe()
    }


    public observer() {
        console.warn('working ', new Date(), this.id)
    }
}

export default WobserverPC
