import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { logger } from './SfuEntry';

export type SfuSctpChannelEntry = ReturnType<typeof createSfuSctpChannelEntry>;

export function createSfuSctpChannelEntry(storageProvider: StorageProvider, model?: Models.SfuSctpChannel) {
	if (!model) return;
	const {
		sfuId,
		sfuTransportId,
		sfuSctpChannelId,
		opened,
	} = model;

	model.sfuTransportId;

	if (!sfuId) return logger.warn(`SfuSctpChannel model without sfuId: ${JSON.stringify(model)}`);
	if (!sfuTransportId) return logger.warn(`SfuSctpChannel model without sfuTransportId: ${JSON.stringify(model)}`);
	if (!sfuSctpChannelId) return logger.warn(`SfuSctpChannel model without sfuSctpChannelId: ${JSON.stringify(model)}`);
	if (!opened) return logger.warn(`SfuSctpChannel model without opened: ${JSON.stringify(model)}`);

	return {
		sfuId,
		sfuTransportId,
		sfuSctpChannelId,
		opened,
		get marker() {
			return model.marker;
		},
		refresh: async () => {
			const refreshedModel = await storageProvider.sfuSctpChannelStorage.get(sfuSctpChannelId);

			if (!refreshedModel) return;

			model.marker = refreshedModel.marker;
		}
	};
}
