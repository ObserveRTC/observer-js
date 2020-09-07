import { v4 as uuidv4 } from 'uuid'
import Queue from '../../observer.db/in.memory.queue'
import { ObserverPlugin } from '../../observer.plugins/base.plugin'
import StatsParser from '../../observer.plugins/stats.parser.plugin'
import BrowserUtil from '../../observer.utils/browser.util'
import TimeUtil from '../../observer.utils/time.util'

export default abstract class ObserverBasePC {
    public readonly id: string = uuidv4()
    public readonly timeZoneOffsetInMinute: number = TimeUtil.getTimeZoneOffsetInMinute()
    public statsDb: Queue = new Queue()
    public browserId?: string
    protected constructor() {
        BrowserUtil.getBrowserId().then(value => this.browserId = value)
    }
}
