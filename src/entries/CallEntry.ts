import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { createLogger } from '../common/logger';
import { asyncIteratorConverter } from '../common/utils';
import { ClientEntry, createClientEntry } from './ClientEntry';

export const logger = createLogger('CallWrapper');

export type CallEntry = ReturnType<typeof createCallEntry>;

export function createCallEntry(storageProvider: StorageProvider, model?: Models.Call) {
	if (!model) return;
	const { 
		callId,
		roomId,
		serviceId,
		started,
	} = model;

	if (!callId) return logger.warn(`Call model without callId: ${JSON.stringify(model)}`);
	if (!roomId) return logger.warn(`Call model without roomId: ${JSON.stringify(model)}`);
	if (!serviceId) return logger.warn(`Call model without serviceId: ${JSON.stringify(model)}`);
	if (!started) return logger.warn(`Call model without started: ${JSON.stringify(model)}`);

	const getClient = async (clientId: string) => {
		return model.clientIds.includes(clientId) ? createClientEntry(storageProvider, await storageProvider.clientStorage.get(clientId)) : undefined;
	};

	const asyncClientsGenerator = async function *(providedClientIds?: string[]) {
		const { clientStorage } = storageProvider;
		const clientModels = await Promise.all(
			(providedClientIds ?? model.clientIds).map((clientId) => clientStorage.get(clientId))
		);

		for (const clientModel of clientModels) {
			if (!clientModel) continue;
			yield createClientEntry(storageProvider, clientModel);
		}
	};
	
	return {
		callId,
		roomId, 
		serviceId,
		started,
		get clientIds(): ReadonlyArray<string> {
			return model.clientIds;
		},
		getClient,
		get clients(): AsyncIterableIterator<ClientEntry> {
			return asyncIteratorConverter<ClientEntry>(asyncClientsGenerator());
		},

		refresh: async () => {
			const refreshedModel = await storageProvider.callStorage.get(callId);

			if (!refreshedModel) return;

			model.clientIds = refreshedModel.clientIds;
		}
	};
}
