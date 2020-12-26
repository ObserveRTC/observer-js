import FingerprintJS from '@fingerprintjs/fingerprintjs'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class BrowserUtil {
    public static async getBrowserId (): Promise<string> {
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        return result.visitorId
    }
}

export {
    BrowserUtil
}
