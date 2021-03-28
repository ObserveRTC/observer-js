import type {
    LocalTransport
} from '../../observer.processor/local.transport'
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

    withLocalTransport (transport: LocalTransport): Builder {
        this.instance.setLocalTransport(transport)
        return this
    }

    withIntegration (integration: Integration): Builder {
        this.instance.setIntegration(integration)
        return this
    }

    withMarker (marker: string): Builder {
        this.instance.updateMarker(marker)
        return this
    }

    withBrowserId (browserId: string): Builder {
        this.instance.setBrowserId(browserId)
        return this
    }

    build (): Observer {
        return this.instance
    }
}
export {
    Builder
}
