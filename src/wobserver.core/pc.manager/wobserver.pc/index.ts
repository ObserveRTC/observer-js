import BrowserUtils from '../../../wobserver.helper/browser.utils'
import TimeUtils from '../../../wobserver.helper/time.utils'
import { WobserverPlugin } from '../../../wobserver.plugins'
import StatsParser from '../../../wobserver.plugins/stats.parser'
import Queue from '../../wobserver.datastructure/queue'

class WobserverPC {
    private readonly id!: string
    private readonly pc!: RTCPeerConnection
    private readonly statsQueue = new Queue()
    private readonly timeZoneOffsetInMinute: number
    private browserId!: string

    private readonly userId?: string
    private readonly callId?: string

    constructor(id: string, pc: RTCPeerConnection, callId?: string, userId?: string) {
        this.id = id
        this.pc = pc
        this.callId = callId
        this.userId = userId
        this.timeZoneOffsetInMinute = TimeUtils.getTimeZoneOffsetInMinute()
        BrowserUtils.getBrowserId().then( currentBrowserId => this.browserId = currentBrowserId)
    }

    public getPc() {
        return this.pc
    }

    public getPcId() {
        return this.id
    }

    public getStatsQueue() {
        return this.statsQueue
    }

    public getBrowserId() {
        return this.browserId
    }

    public getCallId() {
        return this.callId
    }

    public getUserId() {
        return this.userId
    }

    public getTimeZoneOffsetInMinute() {
        return this.timeZoneOffsetInMinute
    }

    public async execute(pluginList: WobserverPlugin[]): Promise<any> {
        for (const curPlugin of pluginList) {
            const result = await curPlugin?.execute(this)
            if (curPlugin instanceof StatsParser && result) {
                this.statsQueue.add(result)
            }
        }
    }
    public dispose() {
        this.statsQueue.clear()
    }
}

export default WobserverPC
