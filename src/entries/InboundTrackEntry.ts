import { createLogger } from '../common/logger';
import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { createCallEntry } from './CallEntry';
import { createClientEntry } from './ClientEntry';
import { createPeerConnectionEntry } from './PeerConnectionEntry';

const logger = createLogger('InboundTrackWrapper');

export type InboundTrackEntry = ReturnType<typeof createInboundTrackEntry>;

export function createInboundTrackEntry(storageProvider: StorageProvider, model?: Models.InboundTrack) {
	if (!model) return;
	const {
		callId,
		clientId,
		peerConnectionId,
		trackId,
		kind,
	} = model;

	if (!callId) return logger.warn(`InboundTrack model without callId: ${JSON.stringify(model)}`);
	if (!clientId) return logger.warn(`InboundTrack model without clientId: ${JSON.stringify(model)}`);
	if (!peerConnectionId) return logger.warn(`InboundTrack model without peerConnectionId: ${JSON.stringify(model)}`);
	if (!trackId) return logger.warn(`InboundTrack model without trackId: ${JSON.stringify(model)}`);
	if (!kind) return logger.warn(`InboundTrack model without kind: ${JSON.stringify(model)}`);

	const direction = 'inbound' as const;
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

		async refresh() {
			const refreshedModel = await storageProvider.inboundTrackStorage.get(trackId);

			if (!refreshedModel) return;

			model.audioStats = refreshedModel.audioStats;
			model.videoStats = refreshedModel.videoStats;
			model.marker = refreshedModel.marker;
			model.ssrc = refreshedModel.ssrc;
		}

	};
}
