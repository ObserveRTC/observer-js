export type ObserverSummary = {
	currentActiveCalls: number;

	totalAddedCall: number;
	totalRemovedCall: number;

	totalRttLt50Measurements: number,
	totalRttLt150Measurements: number,
	totalRttLt300Measurements: number,
	totalRttGtOrEq300Measurements: number,
    
	totalClientIssues: number,
}