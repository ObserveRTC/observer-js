import { WobServerThridParty } from '../index'
import Wobserver from '../../wobserver.core'
import StatsParser from '../../wobserver.plugins/stats.parser'
import StatsSender from '../../wobserver.plugins/stats.sender'

class callstats extends WobServerThridParty {
    public readonly errors = {
        httpError: 'httpError',
        authError: 'authError',
        wsChannelFailure: 'wsChannelFailure',
        success: 'success',
        csProtoError: 'csProtoError',
        appConnectivityError: 'appConnectivityError',
        tokenGenerationError: 'tokenGenerationError',
        ok: 'OK',
        authOngoing: 'authOngoing',
        invalidWebRTCFunctionName: 'Invalid WebRTC function name',
        invalidEndPointType: 'Invalid EndPoint Type',
        invalidTransmissionDirection: 'Invalid fabric transmission direction',
    };

    public readonly fabricEvent = {
        fabricSetupFailed: 'fabricSetupFailed',
        fabricHold: 'fabricHold',
        fabricResume: 'fabricResume',
        audioMute: 'audioMute',
        audioUnmute: 'audioUnmute',
        videoPause: 'videoPause',
        videoResume: 'videoResume',
        fabricUsageEvent: 'fabricUsageEvent',
        fabricTerminated: 'fabricTerminated',
        screenShareStart: 'screenShareStart',
        screenShareStop: 'screenShareStop',
        dominantSpeaker: 'dominantSpeaker',
        activeDeviceList: 'activeDeviceList',
        applicationErrorLog: 'applicationErrorLog',
        callDetails: 'callDetails',
        callUnAnswered: 'callUnAnswered',
    };
      
    public readonly callType = {
        unknown: 'unknown',
        inbound: 'inbound',
        outbound: 'outbound',
        monitoring: 'monitoring',
    };
      
    public readonly roles = {
        agent: 'agent',
        participant: 'participant',
    };
      
    public readonly returnStatus = {
        success: 'success',
        failure: 'failure',
    };
      
    public readonly fabricUsage = {
        audio: 'audio',
        video: 'video',
        data: 'data',
        screen: 'screen',
        multiplex: 'multiplex',
        unbundled: 'unbundled',
    };
      
    public readonly userIdType = {
        local: 'local',
        remote: 'remote',
    };
      
    public readonly qualityRating = {
        excellent: 5,
        good: 4,
        fair: 3,
        poor: 2,
        bad: 1,
    };
      
    public readonly webRTCFunctions = {
        createOffer: 'createOffer',
        createAnswer: 'createAnswer',
        setLocalDescription: 'setLocalDescription',
        setRemoteDescription: 'setRemoteDescription',
        addIceCandidate: 'addIceCandidate',
        getUserMedia: 'getUserMedia',
        iceConnectionFailure: 'iceConnectionFailure',
        signalingError: 'signalingError',
        applicationError: 'applicationError',
        applicationLog: 'applicationLog',
    };
      
    public readonly endpointType = {
        peer: 'peer',
        server: 'server',
    };
      
    public readonly transmissionDirection = {
        sendonly: 'sendonly',
        receiveonly: 'receiveonly',
        sendrecv: 'sendrecv',
        inactive: 'inactive',
    };
    statsParser: any;
    statsSender: any;
    wobserver: any;

    public async initialize(appId: any, appSecret: any, userId: any, initCallback: any) {
        console.log('********* callstats initialization ', appId, appSecret);
        this.statsParser = new StatsParser();
        this.statsSender = new StatsSender('');
        this.wobserver = new Wobserver();
        this.wobserver.attachPlugin(this.statsParser)
        this.wobserver.attachPlugin(this.statsSender)
        this.wobserver.startWorker()
        if (initCallback) {
            initCallback('SDK authentication successful.');
        }
        return {status: 'success'};
      }
    
    public async addNewFabric(pc: any, remoteId: any, fabricUsage: any, conferenceId: any, fabricAttributes: any) {
        console.log('********* callstats addNewFabric ', pc, remoteId);
        return {status: 'success'};
    }
    
    public async sendFabricEvent(pc: any, fabricEvent: any, conferenceId: any, eventData: any) {
        return {status: 'success'};
    }
    
    public async sendCustomEvent(pc: any, conferenceId: any, eventList: any) {
        return {status: 'success'};
    }
    
    public async sendCustomStats(pc: any, conferenceId: any, stats: any) {
        return {status: 'success'};
    }
    
    public async  sendUserFeedback(conferenceId: any, feedback: any, callback: any) {
        return {status: 'success'};
    }
    
    public async associateMstWithUserID(pc: any, remoteId: any, conferenceId: any, ssrc: any, usage: any, videoTag: any) {
        return {status: 'success'};
    }
    
    public async reportError(pc: any, conferenceId: any, functionName: any, domError: any, localSDP: any, remoteSDP: any) {
        return {status: 'success'};
    }
    
    public async  attachWifiStatsHandler(getWifiStatsMethod: any) {
        return {status: 'success'};
    }
}

export default callstats
