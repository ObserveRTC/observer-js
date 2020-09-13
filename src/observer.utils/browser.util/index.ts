import * as Fingerprint2 from 'fingerprintjs2'

class BrowserUtil {
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
}
export default BrowserUtil
