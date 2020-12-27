import type {
    InitialConfig
} from '../../observer.worker/types'
import {
    Observer
} from '../observer'

class Builder {
    private readonly instance: Observer

    constructor (initializeConfig: InitialConfig) {
        this.instance = new Observer(initializeConfig)
    }

    build (): Observer {
        return this.instance
    }
}
export {
    Builder
}
