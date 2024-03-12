export interface ClientSummary {
	clientId: string;
	userId: string;
	joined: number;
	durationInMs: number;
}

export interface CallSummary {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number;
	durationInMs: number;
	clients: ClientSummary[];
}