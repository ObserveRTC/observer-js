import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { ReportsCollector } from '../common/ReportsCollector';
import { visitClient } from './visitors/visitClient';
import { visitPeerConnection } from './visitors/visitPeerConnection';
import { createLogger } from '../common/logger';
import { visitInboundAudioTrack } from './visitors/visitInboundAudioTrack';
import { visitOutboundAudioTrack } from './visitors/visitOutboundAudioTrack';
import { visitOutboundVideoTrack } from './visitors/visitOutboundVideoTarck';
import { visitInboundVideoTrack } from './visitors/visitInboundVideoTrack';
import { InboundTrack } from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { findRemoteMatches as findRemoteMatchFunc } from '../processes/findRemoteMatches';

export const logger = createLogger('VisitObservedCallsMiddleware');

const emptyMap = new Map();

export function createVisitObservedCallsMiddleware(
	storages: StorageProvider,
	reports: ReportsCollector,
	fetchSamples: boolean,
	findRemoteMatches?: boolean,
): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
			observedCalls,
			clients,
			updatedPeerConnections,
			updatedInboundAudioTracks,
			updatedInboundVideoTracks,
			updatedOutboundAudioTracks,
			updatedOutboundVideoTracks,
		} = transaction;

		const visitedPeerConnectionIds = new Set<string>();
		const visitedInboundAudioTrackIds = new Set<string>();
		const visitedInboundVideoTrackIds = new Set<string>();
		const visitedOutboundAudioTrackIds = new Set<string>();
		const visitedOutboundVideoTrackIds = new Set<string>();

		const {
			remoteTrackIds,
			remotePeerConnectionIds,
			remoteClientIds
		} = !findRemoteMatches ? {
			remoteTrackIds: emptyMap,
			remotePeerConnectionIds: emptyMap,
			remoteClientIds: emptyMap,
		} : await findRemoteMatchFunc(
			storages,
			clients,
			new Map<string, InboundTrack>([ ...updatedInboundAudioTracks, ...updatedInboundVideoTracks ])
		);
		
		const now = BigInt(Date.now());
		const fakeTouched = { touched: BigInt(0) };
		
		for (const observedCall of observedCalls.observedCalls()) {
			const { callId, serviceId, roomId } = observedCall;

			for (const observedClient of observedCall.observedClients()) {
				const { clientId } = observedClient;
				const storedClient = clients.get(clientId);

				if (!storedClient) {
					// should not happen as client joined must have run before this
					logger.warn('Client has not been registered');
					continue;
				}
				
				visitClient(
					observedClient, 
					storedClient, 
					reports, 
					fetchSamples
				);
				
				for (const observedPeerConnection of observedClient.observedPeerConnections()) {
					const { peerConnectionId } = observedPeerConnection;

					visitPeerConnection(observedPeerConnection, storedClient, updatedPeerConnections, reports, fetchSamples);

					const storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

					if (!storedPeerConnection) {
						// should not happen, as the visit function should add the peer connection if it does not exists
						logger.warn(
							`PeerConnection ${peerConnectionId} has not been registered for client: ${clientId}, call ${callId}, room: ${roomId}, service: ${serviceId}`
						);
						continue;
					}
					
					storedPeerConnection.touched = now;
					visitedPeerConnectionIds.add(peerConnectionId);

					for (const observedInboundAudioTrack of observedPeerConnection.inboundAudioTracks()) {
						const { trackId } = observedInboundAudioTrack;

						visitInboundAudioTrack(
							observedInboundAudioTrack,
							storedPeerConnection,
							updatedInboundAudioTracks,
							reports,
							fetchSamples,
							remoteTrackIds.get(trackId),
							remotePeerConnectionIds.get(trackId),
							remoteClientIds.get(trackId),
						);

						visitedInboundAudioTrackIds.add(trackId);
						(updatedInboundAudioTracks.get(trackId) ?? fakeTouched).touched = now;
					}

					for (const observedInboundVideoTrack of observedPeerConnection.inboundVideoTracks()) {
						const { trackId } = observedInboundVideoTrack;

						visitInboundVideoTrack(
							observedInboundVideoTrack,
							storedPeerConnection,
							updatedInboundVideoTracks,
							reports,
							fetchSamples,
							remoteTrackIds.get(trackId),
							remotePeerConnectionIds.get(trackId),
							remoteClientIds.get(trackId),
						);

						visitedInboundVideoTrackIds.add(trackId);
						(updatedInboundVideoTracks.get(trackId) ?? fakeTouched).touched = now;
					}

					for (const observedOutboundAudioTrack of observedPeerConnection.outboundAudioTracks()) {
						const { trackId } = observedOutboundAudioTrack;

						visitOutboundAudioTrack(
							observedOutboundAudioTrack,
							storedPeerConnection,
							updatedOutboundAudioTracks,
							reports,
							fetchSamples
						);

						visitedOutboundAudioTrackIds.add(trackId);
						(updatedOutboundAudioTracks.get(trackId) ?? fakeTouched).touched = now;
					}

					for (const observedOutboundVideoTrack of observedPeerConnection.outboundVideoTracks()) {
						const { trackId } = observedOutboundVideoTrack;

						visitOutboundVideoTrack(
							observedOutboundVideoTrack,
							storedPeerConnection,
							updatedOutboundVideoTracks,
							reports,
							fetchSamples
						);

						visitedOutboundVideoTrackIds.add(trackId);
						(updatedOutboundVideoTracks.get(trackId) ?? fakeTouched).touched = now;
					}
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
