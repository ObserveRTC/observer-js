import WebWorker from 'web-worker:./../observer.processor/__package__/index.ts'

export const getObserverWorker = (): Worker => new WebWorker()
