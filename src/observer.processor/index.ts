import {
    ProcessorWorker
} from '../observer.worker/processor.wrapper'

console.warn(
    '$ObserverRTC version[processor]',
    // @ts-expect-error Will be injected in build time
    __buildVersion__,
    'from build date',
    // @ts-expect-error Will be injected in build time
    __buildDate__
)
const processorWorker = new ProcessorWorker()
// eslint-disable-next-line @typescript-eslint/unbound-method
onmessage = processorWorker.onMessage
export {
    processorWorker
}
