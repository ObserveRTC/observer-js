import {
    CandidatePairElement,
    InboundRTPStatElement,
    LocalCandidateElement, MediaSourceElement, OutboundRTPStatElement,
    RemoteCandidateElement, RemoteInboundRTPStatElement, TrackElement
} from '../index'

class StatsMap{
    public static localCandidate(candidate?: any): LocalCandidateElement {
        const {
            candidateType,
            deleted,
            id,
            ip,
            isRemote,
            networkType,
            port,
            priority,
            protocol,
            transportID
        } = candidate as LocalCandidateElement

        return {
            candidateType,
            deleted,
            id,
            ip,
            isRemote,
            networkType,
            port,
            priority,
            protocol,
            transportID
        } as LocalCandidateElement
    }

    public static remoteCandidate(candidate?: any): RemoteCandidateElement {
        const {
            candidateType,
            deleted,
            id,
            ip,
            isRemote,
            port,
            priority,
            protocol,
            transportID
        } = candidate as RemoteCandidateElement

        return {
            candidateType,
            deleted,
            id,
            ip,
            isRemote,
            port,
            priority,
            protocol,
            transportID
        } as RemoteCandidateElement
    }

    public static candidatePair(candidatePair?: any): CandidatePairElement {
        const {
            availableOutgoingBitrate,
            bytesReceived,
            bytesSent,
            consentRequestsSent,
            currentRoundTripTime,
            id,
            localCandidateID,
            nominated,
            priority,
            remoteCandidateID,
            requestsReceived,
            requestsSent,
            responsesReceived,
            responsesSent,
            state,
            totalRoundTripTime,
            transportID,
            writable
        } = candidatePair as CandidatePairElement

        return {
            availableOutgoingBitrate,
            bytesReceived,
            bytesSent,
            consentRequestsSent,
            currentRoundTripTime,
            id,
            localCandidateID,
            nominated,
            priority,
            remoteCandidateID,
            requestsReceived,
            requestsSent,
            responsesReceived,
            responsesSent,
            state,
            totalRoundTripTime,
            transportID,
            writable
        } as CandidatePairElement
    }

    public static mediaSource(stats?: any): MediaSourceElement {
        const {
            audioLevel,
            framesPerSecond,
            height,
            id,
            mediaType,
            totalAudioEnergy,
            totalSamplesDuration,
            trackIdentifier,
            width
        } = stats as MediaSourceElement

        return {
            audioLevel,
            framesPerSecond,
            height,
            id,
            mediaType: mediaType || stats.kind,
            totalAudioEnergy,
            totalSamplesDuration,
            trackIdentifier,
            width
        } as MediaSourceElement
    }

    public static inboundRTPStatElement(stats?: any): InboundRTPStatElement {
        const {
            bytesReceived,
            codecId,
            decoderImplementation,
            estimatedPlayoutTimestamp,
            fecPacketsDiscarded,
            fecPacketsReceived,
            firCount,
            framesDecoded,
            headerBytesReceived,
            id,
            isRemote,
            jitter,
            keyFramesDecoded,
            lastPacketReceivedTimestamp,
            mediaType,
            nackCount,
            packetsLost,
            packetsReceived,
            pliCount,
            qpSum,
            ssrc,
            totalDecodeTime,
            totalInterFrameDelay,
            totalSquaredInterFrameDelay,
            trackId,
            transportId
        } = stats as InboundRTPStatElement

        return {
            bytesReceived,
            codecId,
            decoderImplementation,
            estimatedPlayoutTimestamp,
            fecPacketsDiscarded,
            fecPacketsReceived,
            firCount,
            framesDecoded,
            headerBytesReceived,
            id,
            isRemote,
            jitter,
            keyFramesDecoded,
            lastPacketReceivedTimestamp,
            mediaType: mediaType || stats.kind,
            nackCount,
            packetsLost,
            packetsReceived,
            pliCount,
            qpSum,
            ssrc,
            totalDecodeTime,
            totalInterFrameDelay,
            totalSquaredInterFrameDelay,
            trackId,
            transportId
        } as InboundRTPStatElement
    }

    public static outboundRTPStatElement(stats?: any): OutboundRTPStatElement {
        const {
            bytesSent,
            codecID,
            encoderImplementation,
            firCount,
            framesEncoded,
            headerBytesSent,
            id,
            isRemote,
            keyFramesEncoded,
            mediaSourceID,
            mediaType,
            nackCount,
            packetsSent,
            pliCount,
            qpSum,
            qualityLimitationReason,
            qualityLimitationResolutionChanges,
            remoteID,
            retransmittedBytesSent,
            retransmittedPacketsSent,
            ssrc,
            totalEncodedBytesTarget,
            totalEncodeTime,
            totalPacketSendDelay,
            trackID,
            transportID
        } = stats as OutboundRTPStatElement

        return {
            bytesSent,
            codecID,
            encoderImplementation,
            firCount,
            framesEncoded,
            headerBytesSent,
            id,
            isRemote,
            keyFramesEncoded,
            mediaSourceID,
            mediaType: mediaType || stats.kind,
            nackCount,
            packetsSent,
            pliCount,
            qpSum,
            qualityLimitationReason,
            qualityLimitationResolutionChanges,
            remoteID,
            retransmittedBytesSent,
            retransmittedPacketsSent,
            ssrc,
            totalEncodeTime,
            totalEncodedBytesTarget,
            totalPacketSendDelay,
            trackID,
            transportID
        } as OutboundRTPStatElement
    }

    public static remoteInboundRTPStatElement(stats?: any): RemoteInboundRTPStatElement {
        const {
            codecID,
            id,
            jitter,
            localID,
            mediaType,
            packetsLost,
            roundTripTime,
            ssrc,
            transportID
        } = stats as RemoteInboundRTPStatElement

        return {
            codecID,
            id,
            jitter,
            localID,
            mediaType: mediaType || stats.kind,
            packetsLost,
            roundTripTime,
            ssrc,
            transportID
        } as RemoteInboundRTPStatElement
    }
    public static track(stats?: any): TrackElement {
        const {
            concealedSamples,
            concealmentEvents,
            detached,
            ended,
            framesDecoded,
            framesDropped,
            framesReceived,
            hugeFramesSent,
            id,
            insertedSamplesForDeceleration,
            jitterBufferDelay,
            jitterBufferEmittedCount,
            mediaSourceID,
            mediaType,
            remoteSource,
            removedSamplesForAcceleration,
            samplesDuration,
            silentConcealedSamples,
            totalSamplesReceived
        } = stats as TrackElement

        return {
            concealedSamples,
            concealmentEvents,
            detached,
            ended,
            framesDecoded,
            framesDropped,
            framesReceived,
            hugeFramesSent,
            id,
            insertedSamplesForDeceleration,
            jitterBufferDelay,
            jitterBufferEmittedCount,
            mediaSourceID,
            mediaType: mediaType || stats.kind,
            remoteSource,
            removedSamplesForAcceleration,
            samplesDuration,
            silentConcealedSamples,
            totalSamplesReceived
        } as TrackElement
    }
}
export default StatsMap
