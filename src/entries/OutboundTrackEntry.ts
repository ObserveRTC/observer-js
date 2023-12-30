import { createLogger } from '../common/logger';
import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { createCallEntry } from './CallEntry';
import { createClientEntry } from './ClientEntry';
import { createPeerConnectionEntry } from './PeerConnectionEntry';

const logger = createLogger('OutboundTrackWrapper');

export type OutboundTrackEntry = ReturnType<typeof createOutboundTrackEntry>;

export function createOutboundTrackEntry(storageProvider: StorageProvider, model?: Models.OutboundTrack) {
	if (!model) return;
	const {
		callId,
		clientId,
		peerConnectionId,
		trackId,
		kind,
	} = model;

	if (!callId) return logger.warn(`OutboundTrack model without callId: ${JSON.stringify(model)}`);
	if (!clientId) return logger.warn(`OutboundTrack model without clientId: ${JSON.stringify(model)}`);
	if (!peerConnectionId) return logger.warn(`OutboundTrack model without peerConnectionId: ${JSON.stringify(model)}`);
	if (!trackId) return logger.warn(`OutboundTrack model without trackId: ${JSON.stringify(model)}`);
	if (!kind) return logger.warn(`OutboundTrack model without kind: ${JSON.stringify(model)}`);
	
	const direction = 'outbound' as const;
	const getCall = async () => {
		return createCallEntry(storageProvider, await storageProvider.callStorage.get(callId));
	};
	const getClient = async () => {
		return createClientEntry(storageProvider, await storageProvider.clientStorage.get(clientId));
	};
	const getPeerConnection = async () => {
		return createPeerConnectionEntry(storageProvider, await storageProvider.peerConnectionStorage.get(peerConnectionId));
	};
	
	return {
		callId,
		clientId,
		peerConnectionId,
		trackId,
		direction,
		get kind(): 'audio' | 'video' {
			return kind.toLocaleLowerCase() as 'audio' | 'video';
		},
		get stats() {
			return 0 < model.audioStats.length ? model.audioStats : 0 < model.videoStats.length ? model.videoStats : undefined;
		},
		get marker() {
			return model.marker;
		},
		get ssrc() {
			return model.ssrc;
		},

		getCall,
		getClient,
		getPeerConnection,

		refresh: async () => {
			const refreshedModel = await storageProvider.outboundTrackStorage.get(trackId);

			if (!refreshedModel) return;

			model.audioStats = refreshedModel.audioStats;
			model.videoStats = refreshedModel.videoStats;
			model.marker = refreshedModel.marker;
		}
	};
}
