import Wobserver from '../../wobserver.core'
import StatsParser from '../../wobserver.plugins/stats.parser'
import StatsSender from '../../wobserver.plugins/stats.sender'
import { WobServerThridParty } from '../index'
const serverURL = 'wss://meet.cogint.ai:7879/ws/86ed98c6-b001-48bb-b31e-da638b979c72'

class callstats extends WobServerThridParty {
    public readonly errors = {
        appConnectivityError: 'appConnectivityError',
        authError: 'authError',
        authOngoing: 'authOngoing',
        csProtoError: 'csProtoError',
        httpError: 'httpError',
        invalidEndPointType: 'Invalid EndPoint Type',
        invalidTransmissionDirection: 'Invalid fabric transmission direction',
        invalidWebRTCFunctionName: 'Invalid WebRTC function name',
        ok: 'OK',
        success: 'success',
        tokenGenerationError: 'tokenGenerationError',
        wsChannelFailure: 'wsChannelFailure',
    }

    public readonly fabricEvent = {
        activeDeviceList: 'activeDeviceList',
        applicationErrorLog: 'applicationErrorLog',
        audioMute: 'audioMute',
        audioUnmute: 'audioUnmute',
        callDetails: 'callDetails',
        callUnAnswered: 'callUnAnswered',
        dominantSpeaker: 'dominantSpeaker',
        fabricHold: 'fabricHold',
        fabricResume: 'fabricResume',
        fabricSetupFailed: 'fabricSetupFailed',
        fabricTerminated: 'fabricTerminated',
        fabricUsageEvent: 'fabricUsageEvent',
        screenShareStart: 'screenShareStart',
        screenShareStop: 'screenShareStop',
        videoPause: 'videoPause',
        videoResume: 'videoResume',
    }

    public readonly callType = {
        inbound: 'inbound',
        monitoring: 'monitoring',
        outbound: 'outbound',
        unknown: 'unknown',
    }

    public readonly roles = {
        agent: 'agent',
        participant: 'participant',
    }

    public readonly returnStatus = {
        failure: 'failure',
        success: 'success',
    }

    public readonly fabricUsage = {
        audio: 'audio',
        data: 'data',
        multiplex: 'multiplex',
        screen: 'screen',
        unbundled: 'unbundled',
        video: 'video',
    }

    public readonly userIdType = {
        local: 'local',
        remote: 'remote',
    }

    public readonly qualityRating = {
        bad: 1,
        excellent: 5,
        fair: 3,
        good: 4,
        poor: 2,
    }

    public readonly webRTCFunctions = {
        addIceCandidate: 'addIceCandidate',
        applicationError: 'applicationError',
        applicationLog: 'applicationLog',
        createAnswer: 'createAnswer',
        createOffer: 'createOffer',
        getUserMedia: 'getUserMedia',
        iceConnectionFailure: 'iceConnectionFailure',
        setLocalDescription: 'setLocalDescription',
        setRemoteDescription: 'setRemoteDescription',
        signalingError: 'signalingError',
    }

    public readonly endpointType = {
        peer: 'peer',
        server: 'server',
    }

    public readonly transmissionDirection = {
        inactive: 'inactive',
        receiveonly: 'receiveonly',
        sendonly: 'sendonly',
        sendrecv: 'sendrecv',
    }
    statsParser: any
    statsSender: any
    wobserver: any

    public initialize(appId: any, appSecret: any, userId: any, initCallback: any) {
        console.log('******** callstats initialization ', appId, appSecret)
        this.statsParser = new StatsParser()
        this.statsSender = new StatsSender(serverURL)
        this.wobserver = new Wobserver()
        this.wobserver.attachPlugin(this.statsParser)
        this.wobserver.attachPlugin(this.statsSender)
        this.wobserver.startWorker()
        if (initCallback) {
            setTimeout(() => { initCallback('success', 'SDK authentication successful.')}, 1000)
        }
        return { status: 'success'}
      }

    public addNewFabric(pc: any, remoteId: any, fabricUsage: any, conferenceId: any, fabricAttributes: any) {
        console.log('********* callstats addNewFabric ', pc, remoteId)
        try {
            this.wobserver.addPC(pc)
        } catch (e) {
            console.log('******** addpc error', e)
        }
        return { status: 'success', message: 'success++'}
    }

    public sendFabricEvent(pc: any, fabricEvent: any, conferenceId: any, eventData: any) {
        console.log('********* callstats sendFabricEvent ')
        return { status: 'success'}
    }

    public sendCustomEvent(pc: any, conferenceId: any, eventList: any) {
        console.log('********* callstats sendCustomEvent ')
        return { status: 'success'}
    }

    public sendCustomStats(pc: any, conferenceId: any, stats: any) {
        console.log('********* callstats sendCustomStats ')
        return { status: 'success'}
    }

    public  sendUserFeedback(conferenceId: any, feedback: any, callback: any) {
        console.log('********* callstats sendUserFeedback ')
        return { status: 'success'}
    }

    public associateMstWithUserID(pc: any, remoteId: any, conferenceId: any, ssrc: any, usage: any, videoTag: any) {
        console.log('********* callstats associateMstWithUserID ')
        return { status: 'success'}
    }

    public reportError(pc: any, conferenceId: any, functionName: any, domError: any, localSDP: any, remoteSDP: any) {
        console.log('********* callstats reportError ')
        return { status: 'success'}
    }

    public  attachWifiStatsHandler(getWifiStatsMethod: any) {
        console.log('********* callstats attachWifiStatsHandler ')
        return { status: 'success'}
    }
}

export default callstats
