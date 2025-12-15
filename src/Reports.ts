export type InboundAudioTrackReport = {
	trackId: string,
	fractionLostDistribution: {
		lt001: number;
		lt005: number;
		lt010: number;
		lt020: number;
		lt050: number;
		gtOrEq050: number;
	},
};

export type InboundVideoTrackReport = {
	trackId: string,
	fractionLostDistribution: {
		lt001: number;
		lt005: number;
		lt010: number;
		lt020: number;
		lt050: number;
		gtOrEq050: number;
	},
};

export type OutboundAudioTrackReport = {
	trackId: string,
};

export type OutboundVideoTrackReport = {
	trackId: string,
};

export type InboundTrackReport = ({ kind: 'audio' } & InboundAudioTrackReport) 
| ({ kind: 'video' } & InboundVideoTrackReport);

export type OutboundTrackReport = ({ kind: 'audio' } & OutboundAudioTrackReport) 
| ({ kind: 'video' } & OutboundVideoTrackReport);

export type TrackReport = ({ direction: 'inbound' } & InboundTrackReport)
| ({ direction: 'outbound' } & OutboundTrackReport);

export type ClientReport = {
	callId: string;
	clientId: string;

	totalDataChannelBytesReceived: number;
	totalDataChannelBytesSent: number;
	totalDataChannelMessagesReceived: number;
	totalDataChannelMessagesSent: number;
	totalInboundRtpPacketsReceived: number;
	totalInboundRtpPacketsLost: number;
	totalInboundRtpBytesReceived: number;
	totalOutboundRtpPacketsSent: number;
	totalOutboundRtpBytesSent: number;
	totalAudioBytesReceived: number;
	totalVideoBytesReceived: number;
	totalAudioBytesSent: number;
	totalVideoBytesSent: number;
	totalNumberOfIssues: number;
	
	issues: Record<string, number>;

	rttDistribution: {
		lt50ms: number;
		lt150ms: number;
		lt300ms: number;
		gtOrEq300ms: number;
	},

	scoreDistribution: Record<number, number>;
}