import {
    logger
} from '../../observer.logger'

class ProcessorWorker {
    constructor () {
        this.onMessage = this.onMessage.bind(this)
    }

    onMessage (event: MessageEvent): void {
        logger.warn(event)
    }
}

export {
    ProcessorWorker
}
