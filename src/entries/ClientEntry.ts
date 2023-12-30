import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { logger, createCallEntry } from './CallEntry';
import { asyncIteratorConverter } from '../common/utils';
import { PeerConnectionEntry, createPeerConnectionEntry } from './PeerConnectionEntry';

export type ClientEntry = ReturnType<typeof createClientEntry>;

export function createClientEntry(storageProvider: StorageProvider, model?: Models.Client) {
	if (!model) return;

	const {
		clientId, 
		roomId, 
		serviceId, 
		mediaUnitId, 
		callId, 
		joined, 
		timeZoneId, 
	} = model;

	if (!callId) return logger.warn(`Client model without callId: ${JSON.stringify(model)}`);
	if (!roomId) return logger.warn(`Client model without roomId: ${JSON.stringify(model)}`);
	if (!clientId) return logger.warn(`Client model without clientId: ${JSON.stringify(model)}`);
	if (!serviceId) return logger.warn(`Client model without serviceId: ${JSON.stringify(model)}`);
	if (!mediaUnitId) return logger.warn(`Client model without mediaUnitId: ${JSON.stringify(model)}`);

	const getCall = async () => {
		return createCallEntry(storageProvider, await storageProvider.callStorage.get(callId));
	};

	const asyncPeerConnectionGenerator = async function *(providedPeerConnectionIds?: string[]) {
		const peerConnectionModels = await Promise.all(
			(providedPeerConnectionIds ?? model.peerConnectionIds).map((peerConnectionId) => storageProvider.peerConnectionStorage.get(peerConnectionId))
		);

		for (const peerConnectionModel of peerConnectionModels) {
			if (!peerConnectionModel) continue;
			yield createPeerConnectionEntry(storageProvider, peerConnectionModel);
		}
	};

	return {
		clientId,
		roomId,
		serviceId,
		mediaUnitId,
		callId,
		joined,
		timeZoneId,
		get browser() {
			return model.browser;
		},
		get engine() {
			return model.engine;
		},
		get operationSystem() {
			return model.operationSystem;
		},
		get platform() {
			return model.platform;
		},
		get peerConnectionIds(): ReadonlyArray<string> {
			return model.peerConnectionIds;
		},
		get marker() {
			return model.marker;
		},
		getCall,
		get peerConnections(): AsyncIterableIterator<PeerConnectionEntry> {
			return asyncIteratorConverter<PeerConnectionEntry>(asyncPeerConnectionGenerator());
		},
		getPeerConnection: async (peerConnectionId: string) => {
			return model.peerConnectionIds.includes(peerConnectionId) ? createPeerConnectionEntry(storageProvider, await storageProvider.peerConnectionStorage.get(peerConnectionId)) : undefined;
		},

		refresh: async () => {
			const refreshedModel = await storageProvider.clientStorage.get(clientId);

			if (!refreshedModel) return;

			model.browser = refreshedModel.browser;
			model.engine = refreshedModel.engine;
			model.operationSystem = refreshedModel.operationSystem;
			model.platform = refreshedModel.platform;
			model.peerConnectionIds = refreshedModel.peerConnectionIds;
			model.marker = refreshedModel.marker;
		}
	};
}
