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
            transportId
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
            transportId
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
            transportId
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
            transportId
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
            localCandidateId,
            nominated,
            priority,
            remoteCandidateId,
            requestsReceived,
            requestsSent,
            responsesReceived,
            responsesSent,
            state,
            totalRoundTripTime,
            transportId,
            writable
        } = candidatePair as CandidatePairElement

        return {
            availableOutgoingBitrate,
            bytesReceived,
            bytesSent,
            consentRequestsSent,
            currentRoundTripTime,
            id,
            localCandidateId,
            nominated,
            priority,
            remoteCandidateId,
            requestsReceived,
            requestsSent,
            responsesReceived,
            responsesSent,
            state,
            totalRoundTripTime,
            transportId,
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
            trackId,
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
            trackId: trackId || stats.trackIdentifier,
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
            codecId,
            encoderImplementation,
            firCount,
            framesEncoded,
            headerBytesSent,
            id,
            isRemote,
            keyFramesEncoded,
            mediaSourceId,
            mediaType,
            nackCount,
            packetsSent,
            pliCount,
            qpSum,
            qualityLimitationReason,
            qualityLimitationResolutionChanges,
            remoteId,
            retransmittedBytesSent,
            retransmittedPacketsSent,
            ssrc,
            totalEncodedBytesTarget,
            totalEncodeTime,
            totalPacketSendDelay,
            trackId,
            transportId
        } = stats as OutboundRTPStatElement

        return {
            bytesSent,
            codecId,
            encoderImplementation,
            firCount,
            framesEncoded,
            headerBytesSent,
            id,
            isRemote,
            keyFramesEncoded,
            mediaSourceId,
            mediaType: mediaType || stats.kind,
            nackCount,
            packetsSent,
            pliCount,
            qpSum,
            qualityLimitationReason,
            qualityLimitationResolutionChanges,
            remoteId,
            retransmittedBytesSent,
            retransmittedPacketsSent,
            ssrc,
            totalEncodeTime,
            totalEncodedBytesTarget,
            totalPacketSendDelay,
            trackId,
            transportId
        } as OutboundRTPStatElement
    }

    public static remoteInboundRTPStatElement(stats?: any): RemoteInboundRTPStatElement {
        const {
            codecId,
            id,
            jitter,
            localId,
            mediaType,
            packetsLost,
            roundTripTime,
            ssrc,
            transportId
        } = stats as RemoteInboundRTPStatElement

        return {
            codecId,
            id,
            jitter,
            localId,
            mediaType: mediaType || stats.kind,
            packetsLost,
            roundTripTime,
            ssrc,
            transportId
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
            mediaSourceId,
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
            mediaSourceId,
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
