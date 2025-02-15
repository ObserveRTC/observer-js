export type ObservedCallSummary = {
	currentActiveClients: number;
	
	totalAddedClients: number;
	totalRemovedClients: number;
    
	totalClientsSentBytes: number,
	totalClientsReceivedBytes: number,
	totalClientsReceivedAudioBytes: number,
	totalClientsReceivedVideoBytes: number,
	totalClientsSentAudioBytes: number,
	totalClientsSentVideoBytes: number,
    
	totalRttLt50Measurements: number,
	totalRttLt150Measurements: number,
	totalRttLt300Measurements: number,
	totalRttGtOrEq300Measurements: number,
    
	numberOfIssues: number,
    
	numberOfClientsUsedTurn: number;
}