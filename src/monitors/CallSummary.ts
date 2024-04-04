export interface ClientIssue extends Record<string, unknown> {
	severity: 'critical' | 'major' | 'minor';
	timestamp: number;
	description?: string;
	peerConnectionId?: string,
	trackId?: string,
	attachments?: Record<string, unknown>,
}

export interface ClientSummary extends Record<string, unknown> {
	clientId: string;
	mediaUnitId: string;
	userId?: string;
	joined: number;
	left?: number;
	durationInMs: number;
	avgOutboundAudioBitrate: number,
	avgOutboundVideoBitrate: number,
	avgInboundAudioBitrate: number,
	avgInboundVideoBitrate: number,
	ewmaRttInMs: number,
	usedTurn: boolean;
	issues: ClientIssue[];
}

export interface CallSummary extends Record<string, unknown> {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number;
	durationInMs: number;
	maxNumberOfParticipants: number;
	numberOfIssues: number;
	highestSeverity?: ClientIssue['severity'],
	clients: ClientSummary[];
}
