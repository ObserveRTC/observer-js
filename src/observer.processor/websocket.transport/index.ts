import ReconnectingWebSocket from 'reconnecting-websocket'

import {
    logger
} from '../../observer.logger'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'

class WebSocketTransport {
    private _webSocket?: ReconnectingWebSocket
    constructor (wsServerAddress: string) {
        this.send = this.send.bind(this)
        this.sendBulk = this.sendBulk.bind(this)
        if (!wsServerAddress) {
            throw new Error('websocker server address is required')
        }
        const options = {
            'connectionTimeout': 30000,
            'debug': false,
            // Last two minutes ( 60s + 60s ) status
            'maxEnqueuedMessages': 120,
            'maxRetries': 100
        }
        this._webSocket = new ReconnectingWebSocket(
            wsServerAddress,
            [],
            options
        )
        this._webSocket.onclose = (close): void => {
            logger.warn(
                'websocket closed',
                close
            )
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
}

export {
    WebSocketTransport
}
