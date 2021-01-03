import type {
    InitialConfig
} from '../../observer.worker/types'
import {
    Observer
} from '../observer'
import type {
    Integration
} from '../observer.peer'

class Builder {
    private readonly instance: Observer

    constructor (initializeConfig: InitialConfig) {
        this.instance = new Observer(initializeConfig)
    }

    withIntegration (integration: Integration): Builder {
        this.instance.setIntegration(integration)
        return this
    }

    build (): Observer {
        return this.instance
    }
}
export {
    Builder
}
