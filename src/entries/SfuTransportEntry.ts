import { asyncIteratorConverter } from '../common/utils';
import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { createSfuEntry, logger } from './SfuEntry';
import { createSfuInboundRtpPadEntry } from './SfuInboundRtpPadEntry';
import { createSfuOutboundRtpPadEntry } from './SfuOutboundRtpPadEntry';
import { createSfuSctpChannelEntry } from './SfuSctpChannelEntry';

export type SfuTransportEntry = ReturnType<typeof createSfuTransportEntry>;

export function createSfuTransportEntry(storageProvider: StorageProvider, model?: Models.SfuTransport) {
	if (!model) return;
	const {
		sfuId,
		transportId: sfuTransportId,
		opened,
		internal,
	} = model;

	if (!sfuId) return logger.warn(`SfuTransport model without sfuId: ${JSON.stringify(model)}`);
	if (!sfuTransportId) return logger.warn(`SfuTransport model without sfuTransportId: ${JSON.stringify(model)}`);
	if (!opened) return logger.warn(`SfuTransport model without opened: ${JSON.stringify(model)}`);
	
	const getSfu = async () => {
		return createSfuEntry(storageProvider, await storageProvider.sfuStorage.get(sfuId));
	};
	const getSfuInboundRtpPad = async (sfuInboundRtpPadId: string) => {
		return createSfuInboundRtpPadEntry(storageProvider, await storageProvider.sfuInboundRtpPadStorage.get(sfuInboundRtpPadId));
	};
	const getSfuOutboundRtpPad = async (sfuOutboundRtpPadId: string) => {
		return createSfuOutboundRtpPadEntry(storageProvider, await storageProvider.sfuOutboundRtpPadStorage.get(sfuOutboundRtpPadId));
	};
	const getSfuSctpChannel = async (sfuSctpChannelId: string) => {
		return createSfuSctpChannelEntry(storageProvider, await storageProvider.sfuSctpChannelStorage.get(sfuSctpChannelId));
	};
	const asyncSfuInboundRtpPadGenerator = async function *() {
		const sfuInboundRtpPadModels = await Promise.all(
			model.inboundRtpPadIds.map((sfuInboundRtpPadId) => storageProvider.sfuInboundRtpPadStorage.get(sfuInboundRtpPadId))
		);

		for (const sfuInboundRtpPadModel of sfuInboundRtpPadModels) {
			if (!sfuInboundRtpPadModel) continue;
			yield createSfuInboundRtpPadEntry(storageProvider, sfuInboundRtpPadModel);
		}
	};

	const asyncSfuOutboundRtpPadGenerator = async function *() {
		const sfuOutboundRtpPadModels = await Promise.all(
			model.outboundRtpPadIds.map((sfuOutboundRtpPadId) => storageProvider.sfuOutboundRtpPadStorage.get(sfuOutboundRtpPadId))
		);

		for (const sfuOutboundRtpPadModel of sfuOutboundRtpPadModels) {
			if (!sfuOutboundRtpPadModel) continue;
			yield createSfuOutboundRtpPadEntry(storageProvider, sfuOutboundRtpPadModel);
		}
	};

	const asyncSfuSctpChannelGenerator = async function *() {
		const sfuSctpChannelModels = await Promise.all(
			model.sctpChannelIds.map((sfuSctpChannelId) => storageProvider.sfuSctpChannelStorage.get(sfuSctpChannelId))
		);

		for (const sfuSctpChannelModel of sfuSctpChannelModels) {
			if (!sfuSctpChannelModel) continue;
			yield createSfuSctpChannelEntry(storageProvider, sfuSctpChannelModel);
		}
	};

	return {
		sfuTransportId,
		sfuId,
		opened,
		get internal() {
			return internal === true;
		},
		get marker() {
			return model.marker;
		},
		get inboundRtpPadIds(): ReadonlyArray<string> {
			return model.inboundRtpPadIds;
		},
		get outboundRtpPadIds(): ReadonlyArray<string> {
			return model.outboundRtpPadIds;
		},
		get sctpChannelIds(): ReadonlyArray<string> {
			return model.sctpChannelIds;
		},
		get inboundRtpPads(): AsyncIterableIterator<ReturnType<typeof createSfuInboundRtpPadEntry>> {
			return asyncIteratorConverter<ReturnType<typeof createSfuInboundRtpPadEntry>>(asyncSfuInboundRtpPadGenerator());
		},
		get outboundRtpPads(): AsyncIterableIterator<ReturnType<typeof createSfuOutboundRtpPadEntry>> {
			return asyncIteratorConverter<ReturnType<typeof createSfuOutboundRtpPadEntry>>(asyncSfuOutboundRtpPadGenerator());
		},
		get sctpChannels(): AsyncIterableIterator<ReturnType<typeof createSfuSctpChannelEntry>> {
			return asyncIteratorConverter<ReturnType<typeof createSfuSctpChannelEntry>>(asyncSfuSctpChannelGenerator());
		},
		getSfu,
		getSfuInboundRtpPad,
		getSfuOutboundRtpPad,
		getSfuSctpChannel,
		refresh: async () => {
			const refreshedModel = await storageProvider.sfuTransportStorage.get(sfuTransportId);

			if (!refreshedModel) return;

			model.marker = refreshedModel.marker;
		}
	};
}
