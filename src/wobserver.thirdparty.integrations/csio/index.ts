import { WobServerThridParty } from '../index'
import Wobserver from '../../wobserver.core'
import StatsParser from '../../wobserver.plugins/stats.parser'
import StatsSender from '../../wobserver.plugins/stats.sender'
const serverURL = 'wss://meet.cogint.ai:7879/ws/86ed98c6-b001-48bb-b31e-da638b979c72'
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

    public initialize(appId: any, appSecret: any, userId: any, initCallback: any) {
        console.log('******** callstats initialization ', appId, appSecret);
        this.statsParser = new StatsParser();
        this.statsSender = new StatsSender(serverURL);
        this.wobserver = new Wobserver();
        this.wobserver.attachPlugin(this.statsParser)
        this.wobserver.attachPlugin(this.statsSender)
        this.wobserver.startWorker()
        if (initCallback) {
            setTimeout(function(){ initCallback('success', 'SDK authentication successful.');}, 1000);
        }
        return {status: 'success'};
      }
    
    public addNewFabric(pc: any, remoteId: any, fabricUsage: any, conferenceId: any, fabricAttributes: any) {
        console.log('********* callstats addNewFabric ', pc, remoteId);
        try {
            this.wobserver.addPC(pc);
        } catch(e) {
            console.log('******** addpc error', e);
        }
        return {status: 'success', message: 'success++'};
    }
    
    public sendFabricEvent(pc: any, fabricEvent: any, conferenceId: any, eventData: any) {
        console.log('********* callstats sendFabricEvent ');
        return {status: 'success'};
    }
    
    public sendCustomEvent(pc: any, conferenceId: any, eventList: any) {
        console.log('********* callstats sendCustomEvent ');
        return {status: 'success'};
    }
    
    public sendCustomStats(pc: any, conferenceId: any, stats: any) {
        console.log('********* callstats sendCustomStats ');
        return {status: 'success'};
    }
    
    public  sendUserFeedback(conferenceId: any, feedback: any, callback: any) {
        console.log('********* callstats sendUserFeedback ');
        return {status: 'success'};
    }
    
    public associateMstWithUserID(pc: any, remoteId: any, conferenceId: any, ssrc: any, usage: any, videoTag: any) {
        console.log('********* callstats associateMstWithUserID ');
        return {status: 'success'};
    }
    
    public reportError(pc: any, conferenceId: any, functionName: any, domError: any, localSDP: any, remoteSDP: any) {
        console.log('********* callstats reportError ');
        return {status: 'success'};
    }
    
    public  attachWifiStatsHandler(getWifiStatsMethod: any) {
        console.log('********* callstats attachWifiStatsHandler ');
        return {status: 'success'};
    }
}

export default callstats
