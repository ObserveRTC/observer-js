import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { createLogger } from '../common/logger';
import { SfuTransportEntry, createSfuTransportEntry } from './SfuTransportEntry';
import { asyncIteratorConverter } from '../common/utils';

export const logger = createLogger('CallWrapper');

export type SfuEntry = ReturnType<typeof createSfuEntry>;

export function createSfuEntry(storageProvider: StorageProvider, model?: Models.Sfu) {
	if (!model) return;
	const { 
		sfuId,
		serviceId,
		mediaUnitId,
		joined,
	} = model;

	if (!sfuId) return logger.warn(`Sfu model without sfuId: ${JSON.stringify(model)}`);
	if (!serviceId) return logger.warn(`Sfu model without serviceId: ${JSON.stringify(model)}`);
	if (!mediaUnitId) return logger.warn(`Sfu model without mediaUnitId: ${JSON.stringify(model)}`);
	if (!joined) return logger.warn(`Sfu model without joined: ${JSON.stringify(model)}`);

	const getSfuTransport = async (sfuTransportId: string) => {
		return createSfuTransportEntry(storageProvider, await storageProvider.sfuTransportStorage.get(sfuTransportId));
	};
	const asyncSfuTransportGenerator = async function *() {
		const sfuTransportModels = await Promise.all(
			model.sfuTransportIds.map((sfuTransportId) => storageProvider.sfuTransportStorage.get(sfuTransportId))
		);

		for (const sfuTransportModel of sfuTransportModels) {
			if (!sfuTransportModel) continue;
			yield createSfuTransportEntry(storageProvider, sfuTransportModel);
		}
	};
	
	return {
		sfuId,
		serviceId,
		mediaUnitId,
		joined,
		get marker() {
			return model.marker;
		},
		get sfuTransportIds(): ReadonlyArray<string> {
			return model.sfuTransportIds;
		},
		get sfuTransports(): AsyncIterableIterator<SfuTransportEntry> {
			return asyncIteratorConverter<SfuTransportEntry>(asyncSfuTransportGenerator());
		},
		getSfuTransport,
		refresh: async () => {
			const refreshedModel = await storageProvider.sfuStorage.get(sfuId);

			if (!refreshedModel) return;

			model.marker = refreshedModel.marker;
		}
	};
}
