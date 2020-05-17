import { Subscription } from 'rxjs'

class WobserverPC {
    private readonly id!: string
    private pc!: RTCPeerConnection
    private subscriber: Subscription | undefined

    constructor(id: string, pc: RTCPeerConnection) {
        this.id = id
        this.pc = pc
    }

    public observer() {
        console.warn('working ', new Date(), this.id)
    }

    public addSubscriber(subscriber: Subscription) {
        this.subscriber = subscriber
    }
}

export default WobserverPC
