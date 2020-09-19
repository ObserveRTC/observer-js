// To parse this data:
//
//   import { Convert, PeerConnectionSample } from "./file";
//
//   const peerConnectionSample = Convert.toPeerConnectionSample(json);

export interface PeerConnectionSample {
    browserID?:              string
    callId?:                 string
    customData?:             string
    iceStats?:               IceStats
    peerConnectionID:        string
    receiverStats?:          SendRecvStats
    senderStats?:            SendRecvStats
    timestamp?:              number
    timeZoneOffsetInMinute?: number
    userId?:                 string
}

export interface IceStats {
    candidatePairs?:   CandidatePairElement[]
    localCandidates?:  LocalCandidateElement[]
    remoteCandidates?: RemoteCandidateElement[]
}

export interface CandidatePairElement {
    availableOutgoingBitrate?: number
    bytesReceived?:            number
    bytesSent?:                number
    consentRequestsSent?:      number
    currentRoundTripTime?:     number
    id?:                       string
    localCandidateID?:         string
    nominated?:                boolean
    priority?:                 number
    remoteCandidateID?:        string
    requestsReceived?:         number
    requestsSent?:             number
    responsesReceived?:        number
    responsesSent?:            number
    state?:                    State
    totalRoundTripTime?:       number
    transportID?:              string
    writable?:                 boolean
}

export enum State {
    Failed = 'FAILED',
    Frozen = 'FROZEN',
    InProgress = 'IN_PROGRESS',
    Succeeded = 'SUCCEEDED',
    Unknown = 'UNKNOWN',
    Waiting = 'WAITING',
}

export interface LocalCandidateElement {
    candidateType?: CandidateType
    deleted?:       boolean
    id?:            string
    ip?:            string
    isRemote?:      boolean
    networkType?:   NetworkType
    port?:          number
    priority?:      number
    protocol?:      Protocol
    transportID?:   string
}

export enum CandidateType {
    Host = 'HOST',
    Prflx = 'PRFLX',
    Relay = 'RELAY',
    Srflx = 'SRFLX',
    Unknown = 'UNKNOWN',
}

export enum NetworkType {
    Bluetooth = 'BLUETOOTH',
    Cellular = 'CELLULAR',
    Ethernet = 'ETHERNET',
    Unknown = 'UNKNOWN',
    VPN = 'VPN',
    Wifi = 'WIFI',
    Wimax = 'WIMAX',
}

export enum Protocol {
    TCP = 'TCP',
    UDP = 'UDP',
    Unknown = 'UNKNOWN',
}

export interface RemoteCandidateElement {
    candidateType?: CandidateType
    deleted?:       boolean
    id?:            string
    ip?:            string
    isRemote?:      boolean
    port?:          number
    priority?:      number
    protocol?:      Protocol
    transportID?:   string
}

export interface SendRecvStats {
    inboundRTPStats?:       InboundRTPStatElement[]
    mediaSources?:          MediaSourceElement[]
    outboundRTPStats?:      OutboundRTPStatElement[]
    remoteInboundRTPStats?: RemoteInboundRTPStatElement[]
    tracks?:                TrackElement[]
}

export interface InboundRTPStatElement {
    bytesReceived?:               number
    codecId?:                     string
    decoderImplementation?:       string
    estimatedPlayoutTimestamp?:   number
    fecPacketsDiscarded?:         number
    fecPacketsReceived?:          number
    firCount?:                    number
    framesDecoded?:               number
    headerBytesReceived?:         number
    id?:                          string
    isRemote?:                    boolean
    jitter?:                      number
    keyFramesDecoded?:            number
    lastPacketReceivedTimestamp?: number
    mediaType?:                   MediaType
    nackCount?:                   number
    packetsLost?:                 number
    packetsReceived?:             number
    pliCount?:                    number
    qpSum?:                       number
    ssrc?:                        number
    totalDecodeTime?:             number
    totalInterFrameDelay?:        number
    totalSquaredInterFrameDelay?: number
    trackId?:                     string
    transportId?:                 string
}

export enum MediaType {
    Audio = 'AUDIO',
    Unknown = 'UNKNOWN',
    Video = 'VIDEO',
}

export interface MediaSourceElement {
    audioLevel?:           number
    framesPerSecond?:      number
    height?:               number
    id?:                   string
    mediaType?:            MediaType
    totalAudioEnergy?:     number
    totalSamplesDuration?: number
    trackIdentifier?:      string
    width?:                number
}

export interface OutboundRTPStatElement {
    bytesSent?:                          number
    codecID?:                            string
    encoderImplementation?:              string
    firCount?:                           number
    framesEncoded?:                      number
    headerBytesSent?:                    number
    id?:                                 string
    isRemote?:                           boolean
    keyFramesEncoded?:                   number
    mediaSourceID?:                      string
    mediaType?:                          MediaType
    nackCount?:                          number
    packetsSent?:                        number
    pliCount?:                           number
    qpSum?:                              number
    qualityLimitationReason?:            QualityLimitationReason
    qualityLimitationResolutionChanges?: number
    remoteID?:                           string
    retransmittedBytesSent?:             number
    retransmittedPacketsSent?:           number
    ssrc?:                               number
    totalEncodedBytesTarget?:            number
    totalEncodeTime?:                    number
    totalPacketSendDelay?:               number
    trackID?:                            string
    transportID?:                        string
}

export enum QualityLimitationReason {
    Bandwidth = 'BANDWIDTH',
    CPU = 'CPU',
    None = 'NONE',
    Other = 'OTHER',
    Unknown = 'UNKNOWN',
}

export interface RemoteInboundRTPStatElement {
    codecID?:       string
    id?:            string
    jitter?:        number
    localID?:       string
    mediaType?:     MediaType
    packetsLost?:   number
    roundTripTime?: number
    ssrc?:          number
    transportID?:   string
}

export interface TrackElement {
    concealedSamples?:               number
    concealmentEvents?:              number
    detached?:                       boolean
    ended?:                          boolean
    framesDecoded?:                  number
    framesDropped?:                  number
    framesReceived?:                 number
    hugeFramesSent?:                 number
    id?:                             string
    insertedSamplesForDeceleration?: number
    jitterBufferDelay?:              number
    jitterBufferEmittedCount?:       number
    mediaSourceID?:                  string
    mediaType?:                      MediaType
    remoteSource?:                   boolean
    removedSamplesForAcceleration?:  number
    samplesDuration?:                number
    silentConcealedSamples?:         number
    totalSamplesReceived?:           number
}

// Converts JSON strings to/from your types
export class Convert {
    public static toPeerConnectionSample(json: string): PeerConnectionSample {
        return JSON.parse(json)
    }

    public static peerConnectionSampleToJson(value: PeerConnectionSample): string {
        return JSON.stringify(value)
    }
}
