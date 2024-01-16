import { EvaluatorContext } from '../common/types';
import { StorageProvider } from '../storages/StorageProvider';
import * as Models from '../models/Models';
import { createCallStartedEventReport, createClientJoinedEventReport } from '../sinks/callEventReports';
import { ReportsCollector } from '../common/ReportsCollector';
import { createLogger } from '../common/logger';
import { ObservedClientSourceConfig } from '../sources/ObservedClientSource';
import { Writable } from '../common/utils';

const logger = createLogger('ClientLeftProcess');

export type JoinClientProcessInput = {
	clients: ObservedClientSourceConfig[];

	evaluatorContext?: Writable<EvaluatorContext>;
};

export function createJoinClientProcess(
	storageProvider: StorageProvider,
	reports: ReportsCollector
): (input: JoinClientProcessInput) => Promise<void> {
	const process = async (context: JoinClientProcessInput) => {
		const { clients: joinedClients, evaluatorContext } = context;

		if (joinedClients.length < 1) {
			return;
		}
		const { callStorage, clientStorage } = storageProvider;

		const callIds = joinedClients.map((c) => c.callId);
		const existingCalls = await callStorage.getAll(callIds);
		const newCalls = new Map<string, Models.Call>();
		const newClients = new Map<string, Models.Client>();

		for (const joinedClient of joinedClients) {
			const { serviceId, mediaUnitId, roomId, callId, clientId, joined: timestamp, timeZoneId, marker } = joinedClient;

			let call = existingCalls.get(callId);

			if (!call) {
				call = new Models.Call({
					serviceId,
					roomId,
					callId,
					started: BigInt(timestamp),
				});
				newCalls.set(callId, call);
			}
			if (call.clientIds.find((callClientId) => callClientId === clientId)) {
				logger.warn(`Call ${callId} for room ${roomId} attempted to add client ${clientId} twice`);
				continue;
			}
			call.clientIds.push(clientId);

			// we can extract the lowest timestamp here
			// const joinedTimestamp
			// for (const observedCall of (evaluatorContext?.observedCalls.getObservedCall(callId)?.getObservedClient(clientId)?.samples() ?? [])) {

			// }
			newClients.set(
				clientId,
				new Models.Client({
					serviceId,
					mediaUnitId,
					roomId,
					callId,
					clientId,
					joined: BigInt(timestamp),
					timeZoneId,
					marker,
				})
			);
		}
		const alreadyInsertedCalls =
			0 < newCalls.size ? await callStorage.insertAll(newCalls) : new Map<string, Models.Call>();

		for (const [ callId, newCall ] of newCalls) {
			if (alreadyInsertedCalls.has(callId)) {
				continue;
			}
			const { serviceId, roomId, started } = newCall;

			if (!serviceId || !roomId || !started) {
				continue;
			}

			const callEvent = createCallStartedEventReport(serviceId, roomId, callId, Number(started));

			// if ((evaluatorContext?.observedCalls as ObservedCalls).getObservedCall(callId)) {
			// 	reports.addCallEventReport(callEvent);
			// }
			reports.addCallEventReport(callEvent);
			evaluatorContext?.startedCallIds.push(callId);
		}

		if (0 < existingCalls.size) {
			await callStorage.setAll(existingCalls);
		}

		if (0 < newClients.size) {
			await clientStorage.setAll(newClients);
		}
		for (const [ clientId, client ] of newClients) {
			const {
				serviceId,
				mediaUnitId,
				roomId,
				callId,
				clientId: savedClientId,
				userId,
				// timeZoneId,
				marker,
				joined,
			} = client;

			if (!serviceId || !mediaUnitId || !roomId || !callId || !savedClientId) {
				continue;
			}

			const callEvent = createClientJoinedEventReport(
				serviceId,
				mediaUnitId,
				roomId,
				callId,
				clientId,
				Number(joined),
				userId,
				marker
			);

			reports.addCallEventReport(callEvent);
			evaluatorContext?.joinedClientIds.push(clientId);
		}
	};
	
	return process;
}
