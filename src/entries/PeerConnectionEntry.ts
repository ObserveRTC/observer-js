import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { logger, createCallEntry } from './CallEntry';
import { asyncIteratorConverter } from '../common/utils';
import { createClientEntry } from './ClientEntry';
import { InboundTrackEntry, createInboundTrackEntry } from './InboundTrackEntry';
import { OutboundTrackEntry, createOutboundTrackEntry } from './OutboundTrackEntry';

export type PeerConnectionEntry = ReturnType<typeof createPeerConnectionEntry>;

export function createPeerConnectionEntry(storageProvider: StorageProvider, model?: Models.PeerConnection) {
	if (!model) return;

	const {
		callId, 
		clientId, 
		peerConnectionId, 
		label,
		mediaUnitId, 
		opened, 
		serviceId, 
		roomId, 
		userId, 
		marker
	} = model;

	if (!peerConnectionId) return logger.warn(`PeerConnection model without peerConnectionId: ${JSON.stringify(model)}`);
	if (!callId) return logger.warn(`PeerConnection model without callId: ${JSON.stringify(model)}`);
	if (!clientId) return logger.warn(`PeerConnection model without clientId: ${JSON.stringify(model)}`);

	const getClient = async () => {
		return createClientEntry(storageProvider, await storageProvider.clientStorage.get(clientId));
	};

	const getCall = async () => {
		return createCallEntry(storageProvider, await storageProvider.callStorage.get(callId));
	};

	const asyncInboundTrackGenerator = async function *(providedInboundTrackIds?: string[], kind?: string) {
		const inboundTrackModels = await Promise.all(
			(providedInboundTrackIds ?? model.inboundTrackIds).map((inboundTrackId) => storageProvider.inboundTrackStorage.get(inboundTrackId))
		);

		for (const inboundTrackModel of inboundTrackModels) {
			if (!inboundTrackModel) continue;
			if (kind && inboundTrackModel.kind !== kind) continue;
			yield createInboundTrackEntry(storageProvider, inboundTrackModel);
		}
	};
	const asyncOutboundTrackGenerator = async function *(providedOutboundTrackIds?: string[], kind?: string) {
		const outboundTrackModels = await Promise.all(
			(providedOutboundTrackIds ?? model.outboundTrackIds).map((outboundTrackId) => storageProvider.outboundTrackStorage.get(outboundTrackId))
		);

		for (const outboundTrackModel of outboundTrackModels) {
			if (!outboundTrackModel) continue;
			if (kind && outboundTrackModel.kind !== kind) continue;
			yield createOutboundTrackEntry(storageProvider, outboundTrackModel);
		}
	};

	return {
		callId,
		clientId,
		peerConnectionId,
		marker,
		label,
		mediaUnitId,
		opened,
		serviceId,
		roomId,
		userId,

		getClient,
		getCall,
		
		get iceCandidatePairs() {
			return model.iceCandidatePairs;
		},
		get iceRemoteCandidates() {
			return model.iceRemoteCandidates;
		},
		get iceLocalCandidates() {
			return model.icelocalCandidates;
		},
		get transports() {
			return model.transports;
		},
		get inboundTrackIds(): ReadonlyArray<string> {
			return model.inboundTrackIds;
		},
		get outboundTrackIds(): ReadonlyArray<string> {
			return model.outboundTrackIds;
		},
		get inboundTracks(): AsyncIterableIterator<InboundTrackEntry> {
			return asyncIteratorConverter<InboundTrackEntry>(asyncInboundTrackGenerator());
		},
		get outboundTracks(): AsyncIterableIterator<OutboundTrackEntry> {
			return asyncIteratorConverter<OutboundTrackEntry>(asyncOutboundTrackGenerator());
		},
		get inboundAudioTracks(): AsyncIterableIterator<InboundTrackEntry> {
			return asyncIteratorConverter<InboundTrackEntry>(asyncInboundTrackGenerator(undefined, 'audio'));
		},
		get outboundAudioTracks(): AsyncIterableIterator<OutboundTrackEntry> {
			return asyncIteratorConverter<OutboundTrackEntry>(asyncOutboundTrackGenerator(undefined, 'audio'));
		},
		get inboundVideoTracks(): AsyncIterableIterator<InboundTrackEntry> {
			return asyncIteratorConverter<InboundTrackEntry>(asyncInboundTrackGenerator(undefined, 'video'));
		},
		get outboundVideoTracks(): AsyncIterableIterator<OutboundTrackEntry> {
			return asyncIteratorConverter<OutboundTrackEntry>(asyncOutboundTrackGenerator(undefined, 'video'));
		},
		async getInboundTrack(inboundTrackId: string) {
			return model.inboundTrackIds.includes(inboundTrackId) ? createInboundTrackEntry(storageProvider, await storageProvider.inboundTrackStorage.get(inboundTrackId)) : undefined;
		},
		async getOutboundTrack(outboundTrackId: string) {
			return model.outboundTrackIds.includes(outboundTrackId) ? createOutboundTrackEntry(storageProvider, await storageProvider.outboundTrackStorage.get(outboundTrackId)) : undefined;
		},

		async refresh() {
			const refreshedModel = await storageProvider.peerConnectionStorage.get(peerConnectionId);

			if (!refreshedModel) return;

			model.iceCandidatePairs = refreshedModel.iceCandidatePairs;
			model.iceRemoteCandidates = refreshedModel.iceRemoteCandidates;
			model.icelocalCandidates = refreshedModel.icelocalCandidates;
			model.transports = refreshedModel.transports;
			model.inboundTrackIds = refreshedModel.inboundTrackIds;
			model.outboundTrackIds = refreshedModel.outboundTrackIds;
		}
	};
}
