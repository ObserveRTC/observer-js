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

export type CallMetaReportType =
	| {
			type: CallMetaType.CERTIFICATE;
			payload: Certificate;
	} | {
			type: CallMetaType.CODEC;
			payload: MediaCodecStats;
	} | {
			type: CallMetaType.ICE_LOCAL_CANDIDATE;
			payload: IceLocalCandidate;
	} | {
			type: CallMetaType.ICE_REMOTE_CANDIDATE;
			payload: IceRemoteCandidate;
	} | {
			type: CallMetaType.ICE_SERVER;
			payload: string;
	} | {
			type: CallMetaType.MEDIA_CONSTRAINT;
			payload: string;
	} | {
			type: CallMetaType.MEDIA_DEVICE;
			payload: MediaDevice;
	} | {
			type: CallMetaType.MEDIA_SOURCE;
			payload: MediaSourceStat;
	} | {
			type: CallMetaType.USER_MEDIA_ERROR;
			payload: string;
	} | {
			type: CallMetaType.OPERATION_SYSTEM;
			payload: OperationSystem;
	} | {
			type: CallMetaType.PLATFORM;
			payload: Platform;
	} | {
			type: CallMetaType.ENGINE;
			payload: Engine;
	} | {
			type: CallMetaType.LOCAL_SDP;
			payload: string;
	} | {
			type: CallMetaType.BROWSER;
			payload: Browser;
	};

export function createCallMetaReport(
	serviceId: string,
	mediaUnitId: string,
	roomId: string,
	callId: string,
	clientId: string,
	reportType: CallMetaReportType,
	timestamp?: number
) {
	const report: CallMetaReport = {
		type: reportType.type,
		serviceId,
		mediaUnitId,
		roomId,
		callId,
		clientId,
		payload: JSON.stringify(reportType.payload),
		timestamp: timestamp ?? Date.now(),
	};
	return report;
}
