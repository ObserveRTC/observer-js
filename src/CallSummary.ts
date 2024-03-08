export interface ClientSummary {
	clientId: string;
	userId: string;
	joined: number;
	left: number;
}

export interface DetectedIssues {
	clientId: string,
	issue: string,
	started: number,
	ended: number,
}

export interface CallSummary {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number;
	ended: number;
	clients: ClientSummary[];
	detectedIssues: DetectedIssues[];
}