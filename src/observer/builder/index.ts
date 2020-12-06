import Observer from '../api'

class ObserverBuilder {
    private readonly instance: Observer
    constructor(poolingInterval = 1000) {
        this.instance = new Observer()
    }

    build(): Observer {
        return this.instance
    }
}
export default ObserverBuilder
