import type {
    RawStats
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
    PeerConnectionSample
} from '../../schema/v20200114'
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
    private _webSocketTransport?: WebSocketTransport
    private readonly _processorWorker = new ProcessorWorker(this)

    constructor () {
        this.startWsServer = this.startWsServer.bind(this)
        this.startCronTask = this.startCronTask.bind(this)
        this.onResponseRawStats = this.onResponseRawStats.bind(this)
        this.onResponseInitialConfig = this.onResponseInitialConfig.bind(this)
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
        const socketPayloads = rawStats.map((currentStats) => {
            const payload = {
                'browserId': currentStats.details.browserId,
                'callId': currentStats.details.callId,
                'iceStats': RawStatsProcessor.getIceStats(currentStats.stats),
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

        // Try to send the payload to server
        this._webSocketTransport?.sendBulk(optimizedPayload)
    }

    public updateWorkerInstance (workerScope: any): void {
        this._processorWorker.setWorkerScope(workerScope)
    }

    public initialize (): void {
        this._processorWorker.requestInitialConfig()
    }

    onResponseInitialConfig (rawStats: InitialConfig): void {
        this.startWsServer(rawStats.wsAddress)
        this.startCronTask(rawStats.poolingIntervalInMs)
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
}

const observerProcessor = new ObserverProcessor()
// Update worker scope
observerProcessor.updateWorkerInstance(self)
// Try to initialize
observerProcessor.initialize()
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
onmessage = observerProcessor.messageHandler
