import logger from '../../observer.logger'
import Observer from '../../observer.manager'
import ObserverBuilder from '../../observer.manager/builder'
import StatsParser from '../../observer.plugins/public/stats.parser.plugin'
import StatsSender from '../../observer.plugins/public/websocket.sender.plugin'
import ParserUtil from '../../observer.utils/parser.util'

// @ts-ignore
const wsServerUrl = WS_SERVER_URL || null
// @ts-ignore
const serviceUUID = SERVICE_UUID || null
// @ts-ignore
const mediaUnitId = MEDIA_UNIT_ID || null
// @ts-ignore
const statsVersion = STATS_VERSION || null
class TokBox {
    private readonly serverURL: string = ParserUtil.parseWsServerUrl(
        wsServerUrl,
        serviceUUID,
        mediaUnitId,
        statsVersion)
    private readonly statsParser: StatsParser = new StatsParser()
    private readonly statsSender: StatsSender = new StatsSender(
        this.serverURL
    )
    private observer!: Observer
    public initialize() {
        this.addPeerConnection = this.addPeerConnection.bind(this)
        this.observer = new ObserverBuilder()
            .attachPlugin(this.statsParser)
            .attachPlugin(this.statsSender)
            .build()
        this.overridePeer(this)
    }

    public addPeerConnection(pc: any) {
        /*
        * Every Vonage Video API video chat occurs within a session.
        * You can think of a session as a “room” where clients can interact with one another in real-time.
        * Sessions are hosted on the Vonage Video API cloud and manage user connections, audio-video streams,
        * and user events (such as a new user joining). Each session is associated with a unique session ID.
        * To allow multiple clients to chat with one another, you would simply have them connect to the same session (using the same session ID).
        */
        // @ts-ignore
        const publisher = OT?.publishers?.find()
        // @ts-ignore
        const callId = publisher?.session?.id
        // user id as stream display name
        // @ts-ignore
        const userId = publisher?.stream?.name
        try {
            console.warn('new peer connection', pc, callId, userId)
            this.observer.addPC(pc, callId, userId)
        } catch (e) {
            logger.error(e)
        }
    }

    private overridePeer(that: any) {
        if (!window.RTCPeerConnection) return
        const oldRTCPeerConnection = window.RTCPeerConnection
        // @ts-ignore
        // tslint:disable-next-line:only-arrow-functions
        window.RTCPeerConnection = function() {
            // @ts-ignore
            const pc = new oldRTCPeerConnection(arguments)
            that?.addPeerConnection(pc)
            return pc
        }
        for (const key of Object.keys(oldRTCPeerConnection)) {
            // @ts-ignore
            window.RTCPeerConnection[key] = oldRTCPeerConnection[key]
        }
        // @ts-ignore
        window.RTCPeerConnection.prototype = oldRTCPeerConnection.prototype

    }
}

const integration = new TokBox()
// @ts-ignore
integration.initialize()
export default integration
