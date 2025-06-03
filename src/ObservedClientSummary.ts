export type ObservedClientSummary = {
	totalInboundPacketsLost: number,
	totalInboundPacketsReceived: number,
	totalOutboundPacketsSent: number,
	totalDataChannelBytesSent: number,
	totalDataChannelBytesReceived: number,
	totalDataChannelMessagesSent: number,
	totalDataChannelMessagesReceived: number,
	totalSentBytes: number,
	totalReceivedBytes: number,
	totalReceivedAudioBytes: number,
	totalReceivedVideoBytes: number,
	totalSentAudioBytes: number,
	totalSentVideoBytes: number,

	totalRttLt50Measurements: number,
	totalRttLt150Measurements: number,
	totalRttLt300Measurements: number,
	totalRttGtOrEq300Measurements: number,
	totalScoreSum: number,
	numberOfScoreMeasurements: number,
    
	numberOfIssues: number,
}