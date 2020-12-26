import {
    ObserverProcessor
} from './observer'

const observerProcessor = new ObserverProcessor()
// Update worker scope
observerProcessor.updateWorkerInstance(self)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
onmessage = observerProcessor.messageHandler
// Start cron task
observerProcessor.startCronTask()
