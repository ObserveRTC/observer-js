import FingerprintJS from '@fingerprintjs/fingerprintjs'
import * as Bowser from 'bowser'

import type {
    BrowserDetails,
    MediaDeviceInfo
} from '../../schema/v20200114'
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class BrowserUtil {
    public static async getBrowserId (): Promise<string> {
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        return result.visitorId
    }

    public static getBrowserDetails (): BrowserDetails {
        const browserDetails = Bowser.parse(window.navigator.userAgent)
        return browserDetails as BrowserDetails
    }

    public static async getDeviceList (): Promise<MediaDeviceInfo[]> {
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        return deviceList
    }
}

export {
    BrowserUtil
}
