import ReconnectingWebSocket from 'reconnecting-websocket'

import {
    logger
} from '../../observer.logger'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'
export interface SocketError {
    code: number;
    reason: string;
}
const knownErrorCodes = [
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    4224,
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    4225,
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    4226,
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    4227
]
class WebSocketTransport {
    private _webSocket?: ReconnectingWebSocket
    private readonly _wsServerAddress: string
    private _accessToken?: string
    constructor (wsServerAddress: string, accessToken?: string, wsTransportCallback?: WsTransportCallback) {
        this.send = this.send.bind(this)
        this.sendBulk = this.sendBulk.bind(this)
        this.serverAddress = this.serverAddress.bind(this)
        this.updateAccessToken = this.updateAccessToken.bind(this)
        if (!wsServerAddress) {
            throw new Error('websocket server address is required')
        }
        const options = {
            'connectionTimeout': 30000,
            'debug': false,
            // Last two minutes ( 60s + 60s ) status
            'maxEnqueuedMessages': 120,
            'maxRetries': 100
        }
        this._wsServerAddress = wsServerAddress
        this._accessToken = accessToken
        this._webSocket = new ReconnectingWebSocket(
            () => this.serverAddress(),
            [],
            options
        )
        this._webSocket.onclose = (close): void => {
            logger.warn(
                'websocket closed',
                close
            )
            const {code} = close
            if (knownErrorCodes.includes(code)) {
                wsTransportCallback?.requestAccessToken()
            }
        }
        this._webSocket.onerror = (err): void => {
            logger.warn(
                'websocket error',
                err
            )
        }
        this._webSocket.onopen = (currentEvent): void => {
            logger.warn(
                'websocket on open',
                currentEvent
            )
        }
    }

    serverAddress (): string {
        if (!this._accessToken) {
            return this._wsServerAddress
        }
        return `${this._wsServerAddress}?accessToken=${this._accessToken}`
    }

    public dispose (): void {
        this._webSocket?.close()
        // eslint-disable-next-line no-undefined
        this._webSocket = undefined
    }

    public send (socketPayload: PeerConnectionSample): void {
        logger.warn(
            'sending payload ->',
            socketPayload
        )
        this._webSocket?.send(JSON.stringify(socketPayload))
    }

    public sendBulk (socketPayloadList: PeerConnectionSample[]): void {
        socketPayloadList.forEach((currentPayload) => {
            this.send(currentPayload)
        })
    }

    public updateAccessToken (accessToken?: string): void {
        this._accessToken = accessToken
    }
}

export interface WsTransportCallback {
    requestAccessToken: () => void;
}
export {
    WebSocketTransport
}
