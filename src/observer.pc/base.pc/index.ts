import { v4 as uuidv4 } from 'uuid'
import BrowserUtil from '../../observer.utils/browser.util'
import TimeUtil from '../../observer.utils/time.util'

export default abstract class ObserverBasePC {
    public readonly id: string
    public readonly timeZoneOffsetInMinute?: number
    public browserId?: string
    protected constructor() {
        this.id = uuidv4()
        this.timeZoneOffsetInMinute = TimeUtil.getTimeZoneOffsetInMinute()
        BrowserUtil.getBrowserId().then(value => this.browserId = value)
    }
}
