import { CallEventReport } from "@observertc/report-schemas-js";
import { stringify } from "uuid";

export enum CallEventType {
    CALL_STARTED = 'CALL_STARTED',
    CALL_ENDED = 'CALL_ENDED',
    CLIENT_JOINED = 'CLIENT_JOINED',
    CLIENT_LEFT = 'CLIENT_LEFT',
    PEER_CONNECTION_OPENED = 'PEER_CONNECTION_OPENED',
    PEER_CONNECTION_CLOSED = 'PEER_CONNECTION_CLOSED',
    MEDIA_TRACK_ADDED = 'MEDIA_TRACK_ADDED',
    MEDIA_TRACK_REMOVED = 'MEDIA_TRACK_REMOVED',
}
export function createCallStartedEventReport(
	serviceId: string,
	roomId: string,
	callId: string,
	timestamp: number,
	marker?: string
): CallEventReport {
	return {
		name: CallEventType.CALL_STARTED,
		serviceId,
		roomId,
		callId,
		timestamp,
		marker
	}
}


export function createCallEndedEventReport(
    serviceId: string,
    roomId: string,
	callId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.CALL_ENDED,
		serviceId,
        roomId,
		callId,
        timestamp,
        marker,
    };
}

export function createClientJoinedEventReport(
    serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.CLIENT_JOINED,
		serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
        timestamp,
        marker,
    };
}

export function createClientLeftEventReport(
	serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.CLIENT_LEFT,
		serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
        timestamp,
        marker,
    };
}

export function createPeerConnectionOpenedEventReport(
    serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
	peerConnectionId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.PEER_CONNECTION_OPENED,
        serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
		peerConnectionId,
        timestamp,
        marker,
    };
}

export function createPeerConnectionClosedEventReport(
    serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
	peerConnectionId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.PEER_CONNECTION_CLOSED,
		serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
		peerConnectionId,
        timestamp,
        marker,
    };
}

export function createMediaTrackAddedEventReport(
	serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
	peerConnectionId: string,
	mediaTrackId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.MEDIA_TRACK_ADDED,
        serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
		peerConnectionId,
		mediaTrackId,
        timestamp,
        marker,
    };
}

export function createMediaTrackRemovedEventReport(
	serviceId: string,
	mediaUnitId: string,
    roomId: string,
	callId: string,
	clientId: string,
	peerConnectionId: string,
	mediaTrackId: string,
    timestamp: number,
    marker?: string
): CallEventReport {
    return {
        name: CallEventType.MEDIA_TRACK_REMOVED,
        serviceId,
		mediaUnitId,
        roomId,
		callId,
		clientId,
		peerConnectionId,
		mediaTrackId,
        timestamp,
        marker,
    };
}