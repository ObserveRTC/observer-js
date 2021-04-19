/* eslint-disable max-lines */

/*
 * To parse this data:
 *
 *   import { Convert, PeerConnectionSample } from "./file";
 *
 *   const peerConnectionSample = Convert.toPeerConnectionSample(json);
 */

export interface MediaDeviceInfo {
    deviceId?: string;
    groupId?: string;
    kind?: 'videoinput' | 'audioinput' | 'audiooutput';
    label?: string;
}

export interface ClientDetails {
    browser: {
        name?: string;
        version?: string;
    };
    os: {
        name?: string;
        version?: string;
        versionName?: string;
    };
    platform: {
        type?: string;
        vendor?: string;
        model?: string;
    };
    engine: {
        name?: string;
        version?: string;
    };
}

export interface PeerConnectionSample {
    browserId?: string;
    clientDetails?: ClientDetails;
    callId?: string;
    deviceList?: MediaDeviceInfo[];
    iceStats?: IceStats;
    peerConnectionId?: string;
    receiverStats?: ReceiverStats;
    senderStats?: ReceiverStats;
    userMediaErrors?: UserMediaError[];
    timestamp: number;
    timeZoneOffsetInMinute?: number;
    userId?: string;
    marker?: string;
}

export interface IceStats {
    candidatePairs?: CandidatePairElement[];
    localCandidates?: LocalCandidateElement[];
    remoteCandidates?: RemoteCandidateElement[];
}

export interface CandidatePairElement {
    availableOutgoingBitrate?: number;
    bytesReceived?: number;
    bytesSent?: number;
    consentRequestsSent?: number;
    currentRoundTripTime?: number;
    id?: string;
    localCandidateId?: string;
    nominated?: boolean;
    priority?: number;
    remoteCandidateId?: string;
    requestsReceived?: number;
    requestsSent?: number;
    responsesReceived?: number;
    responsesSent?: number;
    state?: State;
    totalRoundTripTime?: number;
    transportId?: string;
    writable?: boolean;
}

export enum State {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Failed = 'FAILED',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Frozen = 'FROZEN',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InProgress = 'IN_PROGRESS',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Succeeded = 'SUCCEEDED',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Waiting = 'WAITING'
}

export interface LocalCandidateElement {
    candidateType?: CandidateType;
    deleted?: boolean;
    id?: string;
    ip?: string;
    isRemote?: boolean;
    networkType?: NetworkType;
    port?: number;
    priority?: number;
    protocol?: Protocol;
    transportId?: string;
}

export enum CandidateType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Host = 'HOST',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Prflx = 'PRFLX',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Relay = 'RELAY',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Srflx = 'SRFLX',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN'
}

export enum NetworkType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Bluetooth = 'BLUETOOTH',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Cellular = 'CELLULAR',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Ethernet = 'ETHERNET',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VPN = 'VPN',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Wifi = 'WIFI',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Wimax = 'WIMAX'
}

export enum Protocol {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    TCP = 'TCP',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    UDP = 'UDP',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN'
}

export interface RemoteCandidateElement {
    candidateType?: CandidateType;
    deleted?: boolean;
    id?: string;
    ip?: string;
    isRemote?: boolean;
    port?: number;
    priority?: number;
    protocol?: Protocol;
    transportId?: string;
}

export interface ReceiverStats {
    inboundRTPStats?: InboundRTPStatElement[];
    mediaSources?: MediaSourceElement[];
    outboundRTPStats?: OutboundRTPStatElement[];
    remoteInboundRTPStats?: RemoteInboundRTPStatElement[];
    tracks?: TrackElement[];
}

export interface InboundRTPStatElement {
    bytesReceived?: number;
    codecId?: string;
    decoderImplementation?: string;
    estimatedPlayoutTimestamp?: number;
    fecPacketsDiscarded?: number;
    fecPacketsReceived?: number;
    firCount?: number;
    framesDecoded?: number;
    headerBytesReceived?: number;
    id?: string;
    isRemote?: boolean;
    jitter?: number;
    keyFramesDecoded?: number;
    lastPacketReceivedTimestamp?: number;
    mediaType?: MediaType;
    nackCount?: number;
    packetsLost?: number;
    packetsReceived?: number;
    pliCount?: number;
    qpSum?: number;
    ssrc?: number;
    totalDecodeTime?: number;
    totalInterFrameDelay?: number;
    totalSquaredInterFrameDelay?: number;
    trackId?: string;
    transportId?: string;
}

export enum MediaType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Audio = 'AUDIO',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Video = 'VIDEO'
}

export interface MediaSourceElement {
    audioLevel?: number;
    framesPerSecond?: number;
    height?: number;
    id?: string;
    mediaType?: MediaType;
    totalAudioEnergy?: number;
    totalSamplesDuration?: number;
    trackId?: string;
    width?: number;
}

export interface OutboundRTPStatElement {
    bytesSent?: number;
    codecId?: string;
    encoderImplementation?: string;
    firCount?: number;
    framesEncoded?: number;
    headerBytesSent?: number;
    id?: string;
    isRemote?: boolean;
    keyFramesEncoded?: number;
    mediaSourceId?: string;
    mediaType?: MediaType;
    nackCount?: number;
    packetsSent?: number;
    pliCount?: number;
    qpSum?: number;
    qualityLimitationReason?: QualityLimitationReason;
    qualityLimitationResolutionChanges?: number;
    remoteId?: string;
    retransmittedBytesSent?: number;
    retransmittedPacketsSent?: number;
    ssrc?: number;
    totalEncodedBytesTarget?: number;
    totalEncodeTime?: number;
    totalPacketSendDelay?: number;
    trackId?: string;
    transportId?: string;
}

export enum QualityLimitationReason {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Bandwidth = 'BANDWIDTH',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    CPU = 'CPU',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    None = 'NONE',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Other = 'OTHER',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Unknown = 'UNKNOWN'
}

export interface RemoteInboundRTPStatElement {
    codecId?: string;
    id?: string;
    jitter?: number;
    localId?: string;
    mediaType?: MediaType;
    packetsLost?: number;
    roundTripTime?: number;
    ssrc?: number;
    transportId?: string;
}

export interface TrackElement {
    concealedSamples?: number;
    concealmentEvents?: number;
    detached?: boolean;
    ended?: boolean;
    framesDecoded?: number;
    framesDropped?: number;
    framesReceived?: number;
    hugeFramesSent?: number;
    frameWidth?: number;
    frameHeight?: number;
    id?: string;
    insertedSamplesForDeceleration?: number;
    jitterBufferDelay?: number;
    jitterBufferEmittedCount?: number;
    mediaSourceId?: string;
    mediaType?: MediaType;
    remoteSource?: boolean;
    removedSamplesForAcceleration?: number;
    samplesDuration?: number;
    silentConcealedSamples?: number;
    totalSamplesReceived?: number;
}

export interface UserMediaError {
    message?: string;
}

// Converts JSON strings to/from your types
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Convert {
    public static toPeerConnectionSample (json: string): PeerConnectionSample {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return,max-lines
        return JSON.parse(json)
    }

    public static peerConnectionSampleToJson (value: PeerConnectionSample): string {
        return JSON.stringify(value)
    }
}
