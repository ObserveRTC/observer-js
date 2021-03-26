import type {
    RawStats, UserMediaErrorPayload
} from '../../observer.collector/rtc.collector'
import {
    logger
} from '../../observer.logger'
import type {
    Runnable
} from '../../observer.utils/cron'
import {
    CronInterval
} from '../../observer.utils/cron'
import {
    ProcessorWorker
} from '../../observer.worker/processor.wrapper'
import type {
    InitialConfig,
    WorkerCallback
} from '../../observer.worker/types'
import type {
    PeerConnectionSample, UserMediaError
} from '../../schema/v20200114'
import {
    IntegrationOptimizer
} from '../rtc.integration.optimizer'
import type {
    SendRecv
} from '../rtc.raw.stats.processor'
import {
    RawStatsProcessor
} from '../rtc.raw.stats.processor'
import {
    StatsOptimizer
} from '../rtc.stats.optimizer'
import {
    WebSocketTransport
} from '../websocket.transport'


const defaultIntervalDurationInMs = 1000
class ObserverProcessor implements WorkerCallback {
    private readonly _cron = new CronInterval()
    private readonly _statsOptimizer = new StatsOptimizer()
    private readonly _integrationOptimizer = new IntegrationOptimizer()
    private _webSocketTransport?: WebSocketTransport
    private readonly _processorWorker = new ProcessorWorker(this)
    private _initialConfig?: InitialConfig

    constructor () {
        this.startWsServer = this.startWsServer.bind(this)
        this.startCronTask = this.startCronTask.bind(this)
        this.onResponseRawStats = this.onResponseRawStats.bind(this)
        this.onResponseInitialConfig = this.onResponseInitialConfig.bind(this)
        this.sendDataToTransport = this.sendDataToTransport.bind(this)
        // eslint-disable-next-line no-console
        console.warn(
            '$ObserverRTC version[processor]',
            // @ts-expect-error Will be injected in build time
            __buildVersion__,
            'from build date',
            // @ts-expect-error Will be injected in build time
            __buildDate__
        )
    }
    get messageHandler (): any {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        return this._processorWorker.onMessage
    }

    onResponseRawStats (rawStats: RawStats[]): void {
        const filteredStats = this._integrationOptimizer.optimize(rawStats)
        const socketPayloads = filteredStats.map((currentStats) => {
            const payload = {
                'browserId': currentStats.details.browserId,
                'callId': currentStats.details.callId,
                'clientDetails': currentStats.details.clientDetails,
                'deviceList': currentStats.details.deviceList,
                'iceStats': RawStatsProcessor.getIceStats(currentStats.stats),
                'marker': currentStats.details.marker,
                'peerConnectionId': currentStats.details.peerConnectionId,
                'receiverStats': RawStatsProcessor.getSendRecvStats(currentStats.stats.receiverStats as SendRecv[]),
                'senderStats': RawStatsProcessor.getSendRecvStats(currentStats.stats.senderStats as SendRecv[]),
                'timeZoneOffsetInMinute': currentStats.details.timeZoneOffsetInMinute,
                'timestamp': currentStats.details.timestamp,
                'userId': currentStats.details.userId
            } as PeerConnectionSample
            return payload
        })
        // Order is import starts
        const optimizedPayload = socketPayloads.map((currentStats) => this._statsOptimizer.excludeSameCandidates(currentStats))
        this._statsOptimizer.addStatBulk(socketPayloads)
        // Order is import ends

        // Try to send the payload to transport
        this.sendDataToTransport(optimizedPayload)
    }

    onUserMediaError (mediaError: UserMediaErrorPayload): void {
        const socketPayloads: PeerConnectionSample = {
            'browserId': mediaError.details.browserId,
            'clientDetails': mediaError.details.clientDetails,
            'deviceList': mediaError.details.deviceList,
            'marker': mediaError.details.marker,
            'timeZoneOffsetInMinute': mediaError.details.timeZoneOffsetInMinute,
            'timestamp': mediaError.details.timestamp,
            'userMediaErrors': [{'message': mediaError.errName} as UserMediaError]
        } as PeerConnectionSample
        this.sendDataToTransport([socketPayloads])
    }

    public updateWorkerInstance (workerScope: any): void {
        this._processorWorker.setWorkerScope(workerScope)
    }

    public initialize (): void {
        this._processorWorker.requestInitialConfig()
    }

    onResponseInitialConfig (initialConfig: InitialConfig): void {
        this._initialConfig = initialConfig
        this.startCronTask(initialConfig.poolingIntervalInMs)
        if (this._initialConfig.transportType === 'local') {
            // Don't try to initialize websocket transport
            return
        }
        this.startWsServer(initialConfig.wsAddress)
    }

    private startWsServer (wsServerAddress: string): void {
        logger.warn(
            'start websocket server',
            wsServerAddress
        )
        if (this._webSocketTransport) {
            this._webSocketTransport.dispose()
        }
        this._webSocketTransport = new WebSocketTransport(wsServerAddress)
    }

    private startCronTask (intervalDurationInMs: number = defaultIntervalDurationInMs): void {
        this._cron.start(
            {'execute': this._processorWorker.requestRawStats.bind(this)} as Runnable,
            intervalDurationInMs
        )
    }

    private sendDataToTransport (samples: PeerConnectionSample[]): void {
        if (this._initialConfig?.transportType === 'local') {
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
            if (samples.length > 0) {
                this._processorWorker.sendTransportData(samples)
            }
        } else {
            this._webSocketTransport?.sendBulk(samples)
        }
    }
}

const observerProcessor = new ObserverProcessor()
// Update worker scope
observerProcessor.updateWorkerInstance(self)
// Try to initialize
observerProcessor.initialize()
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
onmessage = observerProcessor.messageHandler
