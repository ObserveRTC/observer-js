import logger from '../observer.logger'
import BrowserUtil from '../observer.utils/browser.util'

class ObserverSingleton {
    private browserId: string = ''
    public async getBrowserId(): Promise<string> {
        if (this.browserId) {
            return this.browserId
        }
        this.browserId = await BrowserUtil.getBrowserId()
        logger.warn('browser id', this.browserId)
        return this.browserId
    }
}

const observerSingleton = new ObserverSingleton()
observerSingleton.getBrowserId().catch()

export default observerSingleton
