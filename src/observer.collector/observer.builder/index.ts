import {
    Observer
} from '../observer'

class Builder {
    private readonly instance: Observer

    constructor () {
        this.instance = new Observer()
    }

    build (): Observer {
        return this.instance
    }
}
export {
    Builder
}
