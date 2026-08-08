import { ClientSample, PeerConnectionSample, InboundRtpStats, OutboundRtpStats } from '../../src/schema/ClientSample';

let _ts = 1_700_000_000_000;

/** Monotonic timestamp helper for building successive samples. */
export function nextTimestamp(stepMs = 1000): number {
	_ts += stepMs;

	return _ts;
}

export type InboundSpec = {
	trackId: string,
	kind?: 'audio' | 'video',
	ssrc?: number,
	bytesReceived?: number,
	packetsReceived?: number,
	packetsLost?: number,
	freezeCount?: number,
	pliCount?: number,
	nackCount?: number,
	framesReceived?: number,
	framesDropped?: number,
	concealedSamples?: number,
	totalSamplesReceived?: number,
	jitter?: number,
	jitterBufferDelay?: number,
	jitterBufferEmittedCount?: number,
	frameWidth?: number,
	frameHeight?: number,
	/** track attachments (e.g. { producerId, consumerId }) */
	attachments?: Record<string, unknown>,
};

export type OutboundSpec = {
	trackId: string,
	kind?: 'audio' | 'video',
	ssrc?: number,
	bytesSent?: number,
	packetsSent?: number,
	/** track attachments (e.g. { producerId }) */
	attachments?: Record<string, unknown>,
};

/** A remote-inbound-rtp = a receiver report about one of our outbound (sent) streams. */
export type RemoteInboundSpec = {
	ssrc: number,
	kind?: 'audio' | 'video',
	roundTripTime?: number,
	fractionLost?: number,
	jitter?: number,
	packetsLost?: number,
};

/** A remote-outbound-rtp = a sender report about one of our inbound (received) streams. */
export type RemoteOutboundSpec = {
	ssrc: number,
	kind?: 'audio' | 'video',
	roundTripTime?: number,
	bytesSent?: number,
	packetsSent?: number,
	remoteTimestamp?: number,
};

/** A single selected ICE candidate pair (local + remote candidate), for usingTURN/usingTCP. */
export type IceSpec = {
	localProtocol?: string,
	localCandidateType?: string,
	/** The ICE server url — per W3C webrtc-stats this is only exposed on **local** candidates. */
	localUrl?: string,
	remoteUrl?: string,
	bytesReceived?: number,
	bytesSent?: number,
};

export type PeerConnectionSpec = {
	peerConnectionId: string,
	inbound?: InboundSpec[],
	outbound?: OutboundSpec[],
	remoteInbound?: RemoteInboundSpec[],
	remoteOutbound?: RemoteOutboundSpec[],
	ice?: IceSpec,
};

export type SampleSpec = {
	callId?: string,
	clientId?: string,
	timestamp?: number,
	attachments?: Record<string, unknown>,
	clientEvents?: { type: string, timestamp?: number, payload?: string }[],
	peerConnections?: PeerConnectionSpec[],
};

function buildPeerConnection(spec: PeerConnectionSpec, timestamp: number): PeerConnectionSample {
	const inboundRtps: InboundRtpStats[] = [];
	const inboundTracks = [];
	const outboundRtps: OutboundRtpStats[] = [];
	const outboundTracks = [];
	const mediaSources = [];

	for (const inb of spec.inbound ?? []) {
		const kind = inb.kind ?? 'audio';

		inboundRtps.push({
			timestamp,
			id: `${inb.trackId}-rtp`,
			ssrc: inb.ssrc ?? 1,
			kind,
			trackIdentifier: inb.trackId,
			bytesReceived: inb.bytesReceived ?? 0,
			packetsReceived: inb.packetsReceived ?? 0,
			packetsLost: inb.packetsLost ?? 0,
			freezeCount: inb.freezeCount,
			pliCount: inb.pliCount,
			nackCount: inb.nackCount,
			framesReceived: inb.framesReceived,
			framesDropped: inb.framesDropped,
			concealedSamples: inb.concealedSamples,
			totalSamplesReceived: inb.totalSamplesReceived,
			jitter: inb.jitter,
			jitterBufferDelay: inb.jitterBufferDelay,
			jitterBufferEmittedCount: inb.jitterBufferEmittedCount,
			frameWidth: inb.frameWidth,
			frameHeight: inb.frameHeight,
		} as InboundRtpStats);
		inboundTracks.push({ timestamp, id: inb.trackId, kind, attachments: inb.attachments });
	}

	for (const out of spec.outbound ?? []) {
		const kind = out.kind ?? 'audio';
		const mediaSourceId = `ms-${out.trackId}`;

		// A media source is required for the outbound track to resolve its RTPs (getOutboundRtps()).
		mediaSources.push({ timestamp, id: mediaSourceId, kind, trackIdentifier: out.trackId });
		outboundRtps.push({
			timestamp,
			id: `${out.trackId}-rtp`,
			ssrc: out.ssrc ?? 100,
			kind,
			trackIdentifier: out.trackId,
			mediaSourceId,
			bytesSent: out.bytesSent ?? 0,
			packetsSent: out.packetsSent ?? 0,
		} as OutboundRtpStats);
		outboundTracks.push({ timestamp, id: out.trackId, kind, attachments: out.attachments });
	}

	const remoteInboundRtps = (spec.remoteInbound ?? []).map((r) => ({
		timestamp,
		id: `remote-in-${r.ssrc}`,
		ssrc: r.ssrc,
		kind: r.kind ?? 'audio',
		roundTripTime: r.roundTripTime,
		fractionLost: r.fractionLost,
		jitter: r.jitter,
		packetsLost: r.packetsLost,
	}));

	const remoteOutboundRtps = (spec.remoteOutbound ?? []).map((r) => ({
		timestamp,
		id: `remote-out-${r.ssrc}`,
		ssrc: r.ssrc,
		kind: r.kind ?? 'audio',
		roundTripTime: r.roundTripTime,
		bytesSent: r.bytesSent,
		packetsSent: r.packetsSent,
		remoteTimestamp: r.remoteTimestamp,
	}));

	const iceCandidates = [];
	const iceCandidatePairs = [];
	const iceTransports = [];

	if (spec.ice) {
		const localId = `${spec.peerConnectionId}-local`;
		const remoteId = `${spec.peerConnectionId}-remote`;
		const pairId = `${spec.peerConnectionId}-pair`;

		iceCandidates.push({ timestamp, id: localId, protocol: spec.ice.localProtocol ?? 'udp', candidateType: spec.ice.localCandidateType ?? 'host', url: spec.ice.localUrl });
		iceCandidates.push({ timestamp, id: remoteId, protocol: spec.ice.localProtocol ?? 'udp', candidateType: 'host', url: spec.ice.remoteUrl });
		iceCandidatePairs.push({
			timestamp,
			id: pairId,
			localCandidateId: localId,
			remoteCandidateId: remoteId,
			nominated: true,
			bytesReceived: spec.ice.bytesReceived ?? 0,
			bytesSent: spec.ice.bytesSent ?? 0,
		});
		iceTransports.push({ timestamp, id: `${spec.peerConnectionId}-transport`, selectedCandidatePairId: pairId });
	}

	return {
		peerConnectionId: spec.peerConnectionId,
		inboundRtps,
		inboundTracks,
		outboundRtps,
		outboundTracks,
		mediaSources: mediaSources as PeerConnectionSample['mediaSources'],
		remoteInboundRtps: remoteInboundRtps as PeerConnectionSample['remoteInboundRtps'],
		remoteOutboundRtps: remoteOutboundRtps as PeerConnectionSample['remoteOutboundRtps'],
		iceCandidates: iceCandidates as PeerConnectionSample['iceCandidates'],
		iceCandidatePairs: iceCandidatePairs as PeerConnectionSample['iceCandidatePairs'],
		iceTransports: iceTransports as PeerConnectionSample['iceTransports'],
	};
}

/** Build a minimal-but-valid ClientSample. */
export function makeSample(spec: SampleSpec = {}): ClientSample {
	const timestamp = spec.timestamp ?? nextTimestamp();

	return {
		timestamp,
		callId: spec.callId ?? 'call-1',
		clientId: spec.clientId ?? 'client-1',
		attachments: spec.attachments,
		clientEvents: spec.clientEvents?.map((e) => ({ type: e.type, timestamp: e.timestamp ?? timestamp, payload: e.payload })),
		peerConnections: (spec.peerConnections ?? []).map((pc) => buildPeerConnection(pc, timestamp)),
	};
}
