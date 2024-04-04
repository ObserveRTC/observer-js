import { ClientIssue } from '../ObservedClient';

export interface ClientSummary {
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

export interface CallSummary {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number;
	durationInMs: number;
	maxNumberOfParticipants: number;
	clients: ClientSummary[];
}
