import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { logger } from './SfuEntry';

export type SfuOutboundRtpPadEntry = ReturnType<typeof createSfuOutboundRtpPadEntry>;

export function createSfuOutboundRtpPadEntry(storageProvider: StorageProvider, model?: Models.SfuOutboundRtpPad) {
	if (!model) return;
	const {
		sfuId, 
		sfuTransportId,
		rtpPadId,
		added,
		internal,
	} = model;

	if (!sfuId) return logger.warn(`SfuTransport model without sfuId: ${JSON.stringify(model)}`);
	if (!sfuTransportId) return logger.warn(`SfuTransport model without sfuTransportId: ${JSON.stringify(model)}`);
	if (!rtpPadId) return logger.warn(`SfuTransport model without rtpPadId: ${JSON.stringify(model)}`);
	if (!added) return logger.warn(`SfuTransport model without added: ${JSON.stringify(model)}`);
	
	const direction = 'outbound' as const;

	return {
		sfuTransportId,
		sfuId,
		rtpPadId,
		added,
		direction,
		get internal() {
			return internal === true;
		},
		get marker() {
			return model.marker;
		},
		refresh: async () => {
			const refreshedModel = await storageProvider.sfuTransportStorage.get(sfuTransportId);

			if (!refreshedModel) return;

			model.marker = refreshedModel.marker;
		}
	};
}
