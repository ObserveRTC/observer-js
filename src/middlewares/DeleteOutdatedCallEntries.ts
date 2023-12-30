import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { createLogger } from '../common/logger';
import { StorageProvider } from '..';

export const logger = createLogger('DeleteOutdatedCallEntries');

export function createDeleteOutdatedCallEntries(
	storages: StorageProvider,
	maxIdleTimeInMs: bigint,
): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
			clients,
			
			evaluatorContext,
			
			updatedPeerConnections,
			deletedPeerConnections,

			updatedInboundAudioTracks,
			deletedInboundAudioTracks,

			updatedInboundVideoTracks,
			deletedInboundVideoTracks,

			updatedOutboundAudioTracks,
			deletedOutboundAudioTracks,

			updatedOutboundVideoTracks,
			deletedOutboundVideoTracks,
		} = transaction;

		const now = BigInt(Date.now());
		const deletedCallIds = new Set(evaluatorContext.endedCalls.map((c) => c.callId).filter((id) => Boolean(id)));
		const deletedClientIds = new Set(evaluatorContext.detachedClients.map((c) => c.clientId).filter((id) => Boolean(id)));

		for (const [ peerConnectionId, peerConnection ] of storages.peerConnectionStorage.localEntries()) {
			if (updatedPeerConnections.has(peerConnectionId)) {
				continue;
			}
			
			const { touched, clientId, callId } = peerConnection;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedCallIds.has(callId ?? 'not exists') &&
					!deletedClientIds.has(clientId ?? 'not exists')
				) {
					continue;
				}
			}

			deletedPeerConnections.add(peerConnectionId);

			if (clientId) {
				let storedClient = clients.get(clientId);

				if (storedClient) {
					storedClient.peerConnectionIds = storedClient.peerConnectionIds.filter((pcId) => pcId !== peerConnectionId);
				} else {
					storedClient = await storages.clientStorage.get(clientId);
					if (storedClient) {
						storedClient.peerConnectionIds = storedClient.peerConnectionIds.filter((pcId) => pcId !== peerConnectionId);
						await storages.clientStorage.set(clientId, storedClient);
					}
				}
			}
		}

		for (const [ trackId, inboundTrack ] of storages.inboundTrackStorage.localEntries()) {
			if (updatedInboundAudioTracks.has(trackId) || updatedInboundVideoTracks.has(trackId)) {
				continue;
			}

			const { touched, clientId, callId, peerConnectionId } = inboundTrack;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedCallIds.has(callId ?? 'not exists') &&
					!deletedClientIds.has(clientId ?? 'not exists') && 
					!deletedPeerConnections.has(peerConnectionId ?? 'not exists')
				) {
					continue;
				}
			}

			switch (inboundTrack.kind) {
				case 'audio':
					deletedInboundAudioTracks.add(trackId);
					break;
				case 'video':
					deletedInboundVideoTracks.add(trackId);
			}

			if (peerConnectionId) {
				let storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

				if (!storedPeerConnection) {
					storedPeerConnection = await storages.peerConnectionStorage.get(peerConnectionId);
					if (storedPeerConnection) {
						updatedPeerConnections.set(peerConnectionId, storedPeerConnection);
					}
				}
				if (storedPeerConnection) {
					storedPeerConnection.inboundTrackIds = storedPeerConnection.inboundTrackIds.filter((tId) => tId !== trackId);
				}
			}
		}

		// console.warn("auodiaussdoi", updatedOutboundAudioTracks, updatedOutboundVideoTracks);
		for (const [ trackId, outboundTrack ] of storages.outboundTrackStorage.localEntries()) {
			if (updatedOutboundAudioTracks.has(trackId) || updatedOutboundVideoTracks.has(trackId)) {
				continue;
			}

			const { touched, clientId, callId, peerConnectionId } = outboundTrack;
			// console.warn("deprecated outb tracks", outboundTrack, now, touched, maxIdleTimeInMs, touched && now - touched < maxIdleTimeInMs, callId)

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedCallIds.has(callId ?? 'not exists') &&
					!deletedClientIds.has(clientId ?? 'not exists') && 
					!deletedPeerConnections.has(peerConnectionId ?? 'not exists')
				) {
					continue;
				}
			}

			switch (outboundTrack.kind) {
				case 'audio':
					deletedOutboundAudioTracks.add(trackId);
					break;
				case 'video':
					deletedOutboundVideoTracks.add(trackId);
			}
			
			if (peerConnectionId) {
				let storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

				if (!storedPeerConnection) {
					storedPeerConnection = await storages.peerConnectionStorage.get(peerConnectionId);
					if (storedPeerConnection) {
						updatedPeerConnections.set(peerConnectionId, storedPeerConnection);
					}
				}
				if (storedPeerConnection) {
					storedPeerConnection.outboundTrackIds = storedPeerConnection.outboundTrackIds.filter((tId) => tId !== trackId);
				}
			}
		}
	};
	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await process(context);
		if (next) await next(context);
	};
	
	return result;
}
