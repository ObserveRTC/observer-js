import { CallMetaReport } from '@observertc/report-schemas-js';
import {
	Browser,
	Certificate,
	Engine,
	IceLocalCandidate,
	IceRemoteCandidate,
	MediaCodecStats,
	MediaDevice,
	MediaSourceStat,
	OperationSystem,
	Platform,
} from '@observertc/sample-schemas-js';

// eslint-disable-next-line no-shadow
export enum CallMetaType {
	CERTIFICATE = 'CERTIFICATE',
	CODEC = 'CODEC',
	ICE_LOCAL_CANDIDATE = 'ICE_LOCAL_CANDIDATE',
	ICE_REMOTE_CANDIDATE = 'ICE_REMOTE_CANDIDATE',
	ICE_SERVER = 'ICE_SERVER',
	MEDIA_CONSTRAINT = 'MEDIA_CONSTRAINT',
	MEDIA_DEVICE = 'MEDIA_DEVICE',
	MEDIA_SOURCE = 'MEDIA_SOURCE',
	USER_MEDIA_ERROR = 'USER_MEDIA_ERROR',
	LOCAL_SDP = 'LOCAL_SDP',

	OPERATION_SYSTEM = 'OPERATION_SYSTEM',
	ENGINE = 'ENGINE',
	PLATFORM = 'PLATFORM',
	BROWSER = 'BROWSER',
}

export type CallMetaReportPayloads = {
	[CallMetaType.CERTIFICATE]: Certificate;
	[CallMetaType.CODEC]: MediaCodecStats;
	[CallMetaType.ICE_LOCAL_CANDIDATE]: IceLocalCandidate;
	[CallMetaType.ICE_REMOTE_CANDIDATE]: IceRemoteCandidate;
	[CallMetaType.ICE_SERVER]: string;
	[CallMetaType.MEDIA_CONSTRAINT]: string;
	[CallMetaType.MEDIA_DEVICE]: MediaDevice;
	[CallMetaType.MEDIA_SOURCE]: MediaSourceStat;
	[CallMetaType.USER_MEDIA_ERROR]: string;
	[CallMetaType.OPERATION_SYSTEM]: OperationSystem;
	[CallMetaType.PLATFORM]: Platform;
	[CallMetaType.ENGINE]: Engine;
	[CallMetaType.LOCAL_SDP]: string;
	[CallMetaType.BROWSER]: Browser;
}

export type CallMetaReportType ={
	[k in keyof CallMetaReportPayloads]: { 
		type: k; 
		payload: CallMetaReportPayloads[k]
	};
}[keyof CallMetaReportPayloads];

export function createCallMetaReport(
	serviceId: string,
	mediaUnitId: string,
	roomId: string,
	callId: string,
	clientId: string,
	reportType: CallMetaReportType,
	userId?: string,
	peerConnectionId?: string,
	timestamp?: number
) {
	const report: CallMetaReport = {
		type: reportType.type,
		serviceId,
		mediaUnitId,
		roomId,
		callId,
		clientId,
		userId,
		payload: JSON.stringify(reportType.payload),
		timestamp: timestamp ?? Date.now(),
	};
	
	return report;
}
