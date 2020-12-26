import {
    CronInterval
} from '../../observer.utils/cron'
import {
    ProcessorWorker
} from '../../observer.worker/processor.wrapper'
import type {
    RawStats
} from '../../observer.collector/rtc.collector'
import type {
    Runnable
} from '../../observer.utils/cron'
import type {
    WorkerCallback
} from '../../observer.worker/types'
import {
    logger
} from '../../observer.logger'

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
        logger.warn(rawStats)
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
