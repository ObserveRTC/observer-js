import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { logger } from './SfuEntry';

export type SfuInboundRtpPadEntry = ReturnType<typeof createSfuInboundRtpPadEntry>;

export function createSfuInboundRtpPadEntry(storageProvider: StorageProvider, model?: Models.SfuInboundRtpPad) {
	if (!model) return;
	const {
		sfuId, 
		sfuTransportId,
		added,
		internal,
		rtpPadId,
		mediaUnitId,
	} = model;

	if (!sfuId) return logger.warn(`SfuInboundRtpPad model without sfuId: ${JSON.stringify(model)}`);
	if (!sfuTransportId) return logger.warn(`SfuInboundRtpPad model without sfuTransportId: ${JSON.stringify(model)}`);
	if (!added) return logger.warn(`SfuInboundRtpPad model without added: ${JSON.stringify(model)}`);
	if (!rtpPadId) return logger.warn(`SfuInboundRtpPad model without rtpPadId: ${JSON.stringify(model)}`);
	if (!mediaUnitId) return logger.warn(`SfuInboundRtpPad model without mediaUnitId: ${JSON.stringify(model)}`);

	const direction = 'inbound' as const;

	return {
		sfuId,
		sfuTransportId,
		rtpPadId,
		direction,
		added,
		get internal() {
			return internal === true;
		},
		get marker() {
			return model.marker;
		},
		refresh: async () => {
			const refreshedModel = await storageProvider.sfuInboundRtpPadStorage.get(sfuTransportId);

			if (!refreshedModel) return;

			model.marker = refreshedModel.marker;
		}
	};
}
