import {
    logger
} from '../../observer.logger'
import {
    CronInterval
} from '../../observer.utils/cron'
import {
    TimeUtil
} from '../../observer.utils/time.util'
import {
    ProcessorWorker
} from '../../observer.worker/processor.wrapper'

import type {
    RawStats
} from '../../observer.collector/rtc.collector'
import type {
    PeerConnectionSample
} from '../../schema/v20200114'
import {
    RawStatsProcessor
} from '../rtc.raw.stats.processor'

import type {
    Runnable
} from '../../observer.utils/cron'
import type {
    SendRecv
} from '../rtc.raw.stats.processor'
import type {
    WorkerCallback
} from '../../observer.worker/types'


const intervalDurationInMs = 1000
class ObserverProcessor implements WorkerCallback {
    private readonly _cron = new CronInterval()
    private readonly _processorWorker = new ProcessorWorker(this)

    constructor () {
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
                'timestamp': TimeUtil.getCurrent(),
                'userId': currentStats.details.userId
            } as PeerConnectionSample
            return payload
        })
        logger.warn(socketPayloads)
    }

    public updateWorkerInstance (workerScope: any): void {
        this._processorWorker.setWorkerScope(workerScope)
    }

    public startCronTask (): void {
        this._cron.start(
            {'execute': this._processorWorker.requestRawStats.bind(this)} as Runnable,
            intervalDurationInMs
        )
    }
}

const observerProcessor = new ObserverProcessor()
// Update worker scope
observerProcessor.updateWorkerInstance(self)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
onmessage = observerProcessor.messageHandler
// Start cron task
observerProcessor.startCronTask()
