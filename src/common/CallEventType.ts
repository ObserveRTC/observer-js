// eslint-disable-next-line no-shadow
export enum CallEventType {
	CALL_STARTED = 'CALL_STARTED',
	CALL_ENDED = 'CALL_ENDED',
	CLIENT_JOINED = 'CLIENT_JOINED',
	CLIENT_LEFT = 'CLIENT_LEFT',
	PEER_CONNECTION_OPENED = 'PEER_CONNECTION_OPENED',
	PEER_CONNECTION_CLOSED = 'PEER_CONNECTION_CLOSED',
	MEDIA_TRACK_ADDED = 'MEDIA_TRACK_ADDED',
	MEDIA_TRACK_REMOVED = 'MEDIA_TRACK_REMOVED',
	MEDIA_TRACK_RESUMED = 'MEDIA_TRACK_RESUMED',
	MEDIA_TRACK_MUTED = 'MEDIA_TRACK_MUTED',
	MEDIA_TRACK_UNMUTED = 'MEDIA_TRACK_UNMUTED',
	ICE_GATHERING_STATE_CHANGED = 'ICE_GATHERING_STATE_CHANGED',
	PEER_CONNECTION_STATE_CHANGED = 'PEER_CONNECTION_STATE_CHANGED',
	ICE_CONNECTION_STATE_CHANGED = 'ICE_CONNECTION_STATE_CHANGED',
	DATA_CHANNEL_OPEN = 'DATA_CHANNEL_OPEN',
	DATA_CHANNEL_CLOSED = 'DATA_CHANNEL_CLOSED',
	DATA_CHANNEL_ERROR = 'DATA_CHANNEL_ERROR',
	NEGOTIATION_NEEDED = 'NEGOTIATION_NEEDED',
	SIGNALING_STATE_CHANGE = 'SIGNALING_STATE_CHANGE',
	CLIENT_ISSUE = 'CLIENT_ISSUE',
}

export type CallEventReportTyoe = {
	name: CallEventType.MEDIA_TRACK_ADDED,
	attachment: MediaTrackAddedAttachment,
} | {
	name: CallEventType.PEER_CONNECTION_STATE_CHANGED,
	attachment: PeerConnectionStateChangedAttachment,
} | {
	name: CallEventType.ICE_CONNECTION_STATE_CHANGED,
	attachment: IceConnectionStateChangedAttachment,
} | {
	name: CallEventType.ICE_GATHERING_STATE_CHANGED,
	attachment: IceGatheringStateChangedAttachment,
}

export type MediaTrackAddedAttachment = {
	kind?: 'audio' | 'video',
	direction?: 'inbound' | 'outbound',
	sfuStreamId?: string,
	sfuSinkId?: string,
}

export type PeerConnectionStateChangedAttachment = {
	iceConnectionState?: 'closed' | 'connected' | 'connecting' | 'disconnected' | 'failed' | 'new',
}

export type IceConnectionStateChangedAttachment = {
	iceConnectionState?: 'new' | 'connected' | 'disconnected' | 'failed' | 'closed' | 'checking' | 'completed',
}

export type IceGatheringStateChangedAttachment = {
	iceGatheringState?: 'new' | 'gathering' | 'complete',
}