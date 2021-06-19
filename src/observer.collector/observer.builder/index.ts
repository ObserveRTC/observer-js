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
    private _initialConfig!: InitialConfig
    private _transport?: LocalTransport
    private _marker?: string
    private _browserId?: string
    private _integration?: Integration
    private _accessToken?: string | (() => string)

    constructor (initializeConfig: InitialConfig) {
        this._initialConfig = initializeConfig
    }

    withLocalTransport (transport?: LocalTransport): Builder {
        this._initialConfig = {
            ...this._initialConfig,
            ...transport && {'transportType': 'local'}
        }
        this._transport = transport
        return this
    }

    withIntegration (integration: Integration): Builder {
        this._integration = integration
        return this
    }

    withMarker (marker: string): Builder {
        this._marker = marker
        return this
    }

    withBrowserId (browserId: string): Builder {
        this._browserId = browserId
        return this
    }

    withAccessToken (accessToken?: string | (() => string)): Builder {
        this._accessToken = accessToken
        return this
    }

    build (): Observer {
        const instance = new Observer(this._initialConfig)
        if (this._transport) {
            instance.setLocalTransport(this._transport)
        }
        if (this._integration) {
            instance.setIntegration(this._integration)
        }
        if (this._marker) {
            instance.updateMarker(this._marker)
        }
        if (this._browserId) {
            instance.setBrowserId(this._browserId)
        }
        if (this._accessToken || typeof this._accessToken === 'function') {
            instance.setAccessToken(this._accessToken)
        }
        return instance
    }
}
export {
    Builder
}
