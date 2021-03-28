import {
    logger
} from '../observer.logger'
import {
    BrowserUtil
} from '../observer.utils/browser.util'
import {
    TimeUtil
} from '../observer.utils/time.util'
import type {
    MediaDeviceInfo
} from '../schema/v20200114'

class ObserverSingleton {
    public browserId = ''
    public activeDeviceList?: MediaDeviceInfo[] = []
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    public lastDeviceStateCheckedTimestampInMs = 0
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    private readonly offsetInMs = 60 * 1000
    constructor () {
        this.getBrowserId = this.getBrowserId.bind(this)
        this.getActiveDeviceList = this.getActiveDeviceList.bind(this)
    }
    public async getBrowserId (): Promise<string> {
        if (this.browserId) {
            return this.browserId
        }
        this.browserId = await BrowserUtil.getBrowserId()
        logger.warn(
            'browser id',
            this.browserId
        )
        return this.browserId
    }

    public getActiveDeviceList (): MediaDeviceInfo[] | undefined {
        const nowInMs = TimeUtil.getCurrent()
        if (nowInMs - this.lastDeviceStateCheckedTimestampInMs > this.offsetInMs) {
            this.lastDeviceStateCheckedTimestampInMs = nowInMs
            BrowserUtil.getDeviceList().then((deviceList) => {
                this.activeDeviceList = deviceList
            }).catch(null)
        }
        return this.activeDeviceList
    }
}

const observerSingleton = new ObserverSingleton()
// Update active device list in the beginning
observerSingleton.getActiveDeviceList()

export {
    observerSingleton
}
