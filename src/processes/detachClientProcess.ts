import { EvaluatorContext } from '../common/types';
import { StorageProvider } from '../storages/StorageProvider';
import * as Models from '../models/Models';
import { createCallEndedEventReport, createClientLeftEventReport } from '../sinks/callEventReports';
import { ReportsCollector } from '../common/ReportsCollector';
import { createClosePeerConnectionProcess, ClosePeerConnectionProcessInput } from './closePeerConnectionProcess';
import { createLogger } from '../common/logger';
import { ObservedClientSourceConfig } from '../sources/ObservedClientSource';
import { Writable } from '../common/utils';
import { Semaphore } from '../common/Semaphore';

const logger = createLogger('ClientLeftProcess');

export type DetachClientProcessInput = {
	clients: (ObservedClientSourceConfig & {
		detached: number;
	})[];
	recursive: boolean;

	evaluatorContext?: Writable<EvaluatorContext>;
};

export function createDetachClientProcess(
	storageProvider: StorageProvider,
	reports: ReportsCollector
): (input: DetachClientProcessInput) => Promise<void> {
	const peerConnectionClosedProcess = createClosePeerConnectionProcess(storageProvider);
	const process = async (context: DetachClientProcessInput) => {
		const { clients: detachedClients, recursive, evaluatorContext } = context;
		const { callStorage, clientStorage } = storageProvider;

		const clientIds = detachedClients.map((c) => c.clientId);

		if (clientIds.length < 1) return;

		const clients = await clientStorage.getAll(clientIds);
		const callToClientIds = new Map<string, string[]>();

		for (const client of clients.values()) {
			const { callId, clientId } = client;
			if (!callId || !clientId) {
				continue;
			}
			callToClientIds.set(callId, [...(callToClientIds.get(callId) ?? []), clientId]);
		}

		const peerConnectionCloseProcessInput: ClosePeerConnectionProcessInput = {
			closedPeerConnections: [],
			recursive,
		};
		const callDetaches = new Map<string, number>();
		await clientStorage.removeAll(clientIds).then((deletedClientIds) => {
			for (const { clientId, detached } of detachedClients) {
				if (!deletedClientIds.has(clientId)) {
					continue;
				}
				const deletedClient = clients.get(clientId);
				if (!deletedClient) {
					continue;
				}
				const { roomId, serviceId, mediaUnitId, marker, callId } = deletedClient;
				if (!roomId || !serviceId || !mediaUnitId || !callId) {
					continue;
				}

				for (const peerConnectionId of deletedClient.peerConnectionIds) {
					peerConnectionCloseProcessInput.closedPeerConnections.push({
						peerConnectionId,
						closed: detached,
					});
				}
				if (0 < deletedClient.peerConnectionIds.length) {
				}

				reports.addCallEventReport(
					createClientLeftEventReport(serviceId, mediaUnitId, roomId, callId, clientId, detached, marker)
				);
				evaluatorContext?.detachedClients.push({
					...deletedClient,
					detached: Number(detached),
				});

				callDetaches.set(callId, Math.max(callDetaches.get(callId) ?? 0, detached));
			}
		});
		if (recursive && 0 < peerConnectionCloseProcessInput.closedPeerConnections.length) {
			await peerConnectionClosedProcess(peerConnectionCloseProcessInput).catch((err) => {
				logger.error(`Error occurred while closing peer connections`, err);
			});
		}

		const calls = await callStorage.getAll(callToClientIds.keys());
		const updatedCalls = new Map<string, Models.Call>();
		const removedCallIds: string[] = [];
		for (const call of calls.values()) {
			const { callId, serviceId, roomId } = call;
			if (!callId || !roomId || !serviceId) continue;

			const removedClientIds = callToClientIds.get(callId) ?? [];
			call.clientIds = call.clientIds.filter((clientId) => !removedClientIds.includes(clientId));
			if (call.clientIds.length < 1) {
				removedCallIds.push(callId);
			} else {
				updatedCalls.set(callId, call);
			}
		}
		if (0 < updatedCalls.size) {
			await callStorage.setAll(updatedCalls);
		}
		if (0 < removedCallIds.length) {
			await callStorage.removeAll(removedCallIds).then((deletedCalls) => {
				for (const [callId, deletedCall] of deletedCalls) {
					const { serviceId, roomId } = deletedCall;
					if (!serviceId || !roomId || !callId) continue;

					const ended = callDetaches.get(callId) ?? Date.now();
					const callEvent = createCallEndedEventReport(serviceId, roomId, callId, ended);
					reports.addCallEventReport(callEvent);

					evaluatorContext?.endedCalls.push({
						...deletedCall,
						ended,
					});
				}
			});
		}
	};
	return process;
}
