export interface ClientSummary {
	clientId: string;
	mediaUnitId: string;
	userId?: string;
	joined: number;
	durationInMs: number;
	avgOutboundAudioBitrate: number,
	avgOutboundVideoBitrate: number,
	avgInboundAudioBitrate: number,
	avgInboundVideoBitrate: number,
	ewmaRttInMs: number,
}

export interface CallSummary {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number;
	durationInMs: number;
	clients: ClientSummary[];
}
