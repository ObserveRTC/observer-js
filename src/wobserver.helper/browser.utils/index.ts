import * as Fingerprint2 from 'fingerprintjs2'

class BrowserUtils {
    public static async getBrowserId(): Promise<string> {
        return new Promise((resolve, _) => {
            Fingerprint2.get({ }, (components: any[]) => {
                const values = components?.map(currentComponent => {
                    return currentComponent?.value
                })
                const murmur = Fingerprint2.x64hash128(values.join(''), 31)
                resolve(murmur)
            })
        })
    }

    public static parseWsServerUrl(serverURL: string, serverUUID: string): string {
        if (!serverURL)return ''
        if (!serverUUID)return ''

        serverURL = `${serverURL.replace(/\/$/, '')}`
        serverUUID = `${serverUUID.replace(/^\//, '')}`
        return `${serverURL}/${serverUUID}`
    }
}

export default BrowserUtils
