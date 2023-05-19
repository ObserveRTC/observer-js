import { ObservedClient } from '../../samples/ObservedClient';
import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { CallMetaType, createCallMetaReport } from '../../common/callMetaReports';
import {
	Samples_ClientSample_Browser,
	Samples_ClientSample_Engine,
	Samples_ClientSample_OperationSystem,
	Samples_ClientSample_Platform,
} from '../../models/samples_pb';

export function visitClient(
	observedClient: ObservedClient,
	client: Models.Client,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { mediaUnitId, clientId } = observedClient;

	const { callId, serviceId, roomId } = observedClient.call;

	for (const clientSample of observedClient.samples()) {
		if (clientSample.os && (
			client.operationSystem?.name !== clientSample.os.name || 
			client.operationSystem?.version !== clientSample.os.version ||
			client.operationSystem?.versionName !== clientSample.os.versionName
		)) {
			if (fetchSamples) {
				client.operationSystem = new Samples_ClientSample_OperationSystem({
					...clientSample.os,
				});
			}
			
			const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
				type: CallMetaType.OPERATION_SYSTEM,
				payload: clientSample.os,
			});
			reports.addCallMetaReport(callMetaReport);
		}

		if (clientSample.engine && (
			client.engine?.name !== clientSample.engine.name || 
			client.engine?.version !== clientSample.engine.version
		)) {
			if (fetchSamples) {
				client.engine = new Samples_ClientSample_Engine({
					...clientSample.engine,
				});
			}

			const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
				type: CallMetaType.ENGINE,
				payload: clientSample.engine,
			});
			reports.addCallMetaReport(callMetaReport);
		}

		if (clientSample.platform && (
			client.platform?.model !== clientSample.platform.model || 
			client.platform?.type !== clientSample.platform.type ||
			client.platform?.vendor !== clientSample.platform.vendor
		)) {
			if (fetchSamples) {
				client.platform = new Samples_ClientSample_Platform({
					...clientSample.platform,
				});
			}

			const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
				type: CallMetaType.PLATFORM,
				payload: clientSample.platform,
			});
			reports.addCallMetaReport(callMetaReport);
		}

		if (clientSample.browser && (
			client.browser?.name !== clientSample.browser.name || 
			client.browser?.version !== clientSample.browser.version
		)) {
			if (fetchSamples) {
				client.browser = new Samples_ClientSample_Browser({
					...clientSample.browser,
				});
			}

			const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
				type: CallMetaType.BROWSER,
				payload: clientSample.browser,
			});
			reports.addCallMetaReport(callMetaReport);
		}

		if (clientSample.mediaConstraints && 0 < clientSample.mediaConstraints.length) {
			for (const mediaConstraint of clientSample.mediaConstraints) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.MEDIA_CONSTRAINT,
					payload: mediaConstraint,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}
		

		if (clientSample.localSDPs && 0 < clientSample.localSDPs.length) {
			for (const localSDP of clientSample.localSDPs) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.LOCAL_SDP,
					payload: localSDP,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.extensionStats && 0 < clientSample.extensionStats.length) {
			for (const extensionStats of clientSample.extensionStats) {
				reports.addClientExtensionReport({
					serviceId,
					mediaUnitId,
					roomId,
					callId,
					clientId,
					timestamp: Date.now(),
					payload: extensionStats.payload,
					extensionType: extensionStats.type,
				});
			}
		}

		if (clientSample.customCallEvents && 0 < clientSample.customCallEvents.length) {
			for (const callEvent of clientSample.customCallEvents) {
				reports.addCallEventReport({
					serviceId,
					mediaUnitId,
					roomId,
					callId,
					clientId,
					timestamp: Date.now(),
					...callEvent,
				});
			}
		}

		if (clientSample.userMediaErrors && 0 < clientSample.userMediaErrors.length) {
			for (const userMediaError of clientSample.userMediaErrors) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.USER_MEDIA_ERROR,
					payload: userMediaError,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.certificates && 0 < clientSample.certificates.length) {
			for (const certificate of clientSample.certificates) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.CERTIFICATE,
					payload: certificate,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.codecs && 0 < clientSample.codecs.length) {
			for (const codec of clientSample.codecs) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.CODEC,
					payload: codec,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.iceServers && 0 < clientSample.iceServers.length) {
			for (const iceServer of clientSample.iceServers) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.ICE_SERVER,
					payload: iceServer,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.mediaDevices && 0 < clientSample.mediaDevices.length) {
			for (const mediaDevice of clientSample.mediaDevices) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.MEDIA_DEVICE,
					payload: mediaDevice,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}

		if (clientSample.mediaSources && 0 < clientSample.mediaSources.length) {
			for (const mediaSource of clientSample.mediaSources) {
				const callMetaReport = createCallMetaReport(serviceId, mediaUnitId, roomId, callId, clientId, {
					type: CallMetaType.MEDIA_SOURCE,
					payload: mediaSource,
				});
				reports.addCallMetaReport(callMetaReport);
			}
		}
	}
}
