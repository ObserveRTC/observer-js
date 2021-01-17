import FingerprintJS from '@fingerprintjs/fingerprintjs'
import * as Bowser from 'bowser'

import type {
    ClientDetails,
    MediaDeviceInfo
} from '../../schema/v20200114'
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class BrowserUtil {
    public static async getBrowserId (): Promise<string> {
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        return result.visitorId
    }

    public static getClientDetails (): ClientDetails {
        const clientDetails = Bowser.parse(window.navigator.userAgent)
        return clientDetails as ClientDetails
    }

    public static async getDeviceList (): Promise<MediaDeviceInfo[]> {
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        return deviceList.map((currentDeviceInfo) => ({
            'deviceId': currentDeviceInfo.deviceId,
            'groupId': currentDeviceInfo.groupId,
            'kind': currentDeviceInfo.kind,
            'label': currentDeviceInfo.label
        } as MediaDeviceInfo))
    }
}

export {
    BrowserUtil
}
