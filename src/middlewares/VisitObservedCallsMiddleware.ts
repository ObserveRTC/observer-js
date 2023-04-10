import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { ReportsCollector } from '../common/ReportsCollector';
import { visitClient } from './visitors/visitClient';
import { visitPeerConnection } from './visitors/visitPeerConnection';
import { createLogger } from '../common/logger';
import { visitInboundAudioTrack } from './visitors/visitInboundAudioTrack';
import { visitOutboundAudioTrack } from './visitors/visitOutboundAudioTrack';
import { visitOutboundVideoTrack } from './visitors/visitOutboundVideoTarcks';

export const logger = createLogger('VisitObservedCallsMiddleware');

export function createVisitObservedCallsMiddleware(
	reports: ReportsCollector,
	fetchSamples: boolean
): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
			observedCalls,
			clients,
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

		const visitedPeerConnectionIds = new Set<string>();
		const visitedInboundAudioTrackIds = new Set<string>();
		const visitedInboundVideoTrackIds = new Set<string>();
		const visitedOutboundAudioTrackIds = new Set<string>();
		const visitedOutboundVideoTrackIds = new Set<string>();

		for (const observedCall of observedCalls.observedCalls()) {
			const { callId, serviceId, roomId } = observedCall;

			for (const observedClient of observedCall.observedClients()) {
				const { clientId } = observedClient;
				const storedClient = clients.get(clientId);

				// console.warn("dskfjhdkfhsdkf", observedClient, storedClient);
				if (!storedClient) {
					// should not happen as client joined must have run before this
					logger.warn('Client has not been registered');
					continue;
				}

				visitClient(observedClient, storedClient, reports, fetchSamples);

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

					visitedPeerConnectionIds.add(peerConnectionId);

					for (const observedInboundAudioTrack of observedPeerConnection.inboundAudioTracks()) {
						const { trackId } = observedInboundAudioTrack;

						visitInboundAudioTrack(
							observedInboundAudioTrack,
							storedPeerConnection,
							updatedInboundAudioTracks,
							reports,
							fetchSamples
						);

						visitedInboundAudioTrackIds.add(trackId);
					}

					for (const observedInboundVideoTrack of observedPeerConnection.inboundVideoTracks()) {
						const { trackId } = observedInboundVideoTrack;

						visitInboundAudioTrack(
							observedInboundVideoTrack,
							storedPeerConnection,
							updatedInboundVideoTracks,
							reports,
							fetchSamples
						);

						visitedInboundVideoTrackIds.add(trackId);
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
					}
				}
			}
		}

		for (const [peerConnectionId, peerConnection] of Array.from(updatedPeerConnections.entries())) {
			if (visitedPeerConnectionIds.has(peerConnectionId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, callId, clientId } = peerConnection;

			if (!serviceId || !callId || !clientId) {
				continue;
			}

			const storedClient = clients.get(clientId);

			updatedPeerConnections.delete(peerConnectionId);
			deletedPeerConnections.add(peerConnectionId);

			// also update the client model
			if (storedClient) {
				storedClient.peerConnectionIds = storedClient.peerConnectionIds.filter((pcId) => pcId !== peerConnectionId);
			}
		}

		for (const [trackId, inboundAudioTrack] of Array.from(updatedInboundAudioTracks.entries())) {
			if (visitedInboundAudioTrackIds.has(trackId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, callId, clientId, peerConnectionId } = inboundAudioTrack;

			if (!serviceId || !callId || !clientId || !peerConnectionId) {
				continue;
			}

			const storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

			updatedInboundAudioTracks.delete(peerConnectionId);
			deletedInboundAudioTracks.add(peerConnectionId);

			// also update the peer connection model
			if (storedPeerConnection) {
				storedPeerConnection.inboundTrackIds = storedPeerConnection.inboundTrackIds.filter((tId) => tId !== trackId);
			}
		}

		for (const [trackId, inboundVideoTrack] of Array.from(updatedInboundVideoTracks.entries())) {
			if (visitedInboundVideoTrackIds.has(trackId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, callId, clientId, peerConnectionId } = inboundVideoTrack;

			if (!serviceId || !callId || !clientId || !peerConnectionId) {
				continue;
			}

			const storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

			updatedInboundVideoTracks.delete(peerConnectionId);
			deletedInboundVideoTracks.add(peerConnectionId);

			// also update the peer connection model
			if (storedPeerConnection) {
				storedPeerConnection.inboundTrackIds = storedPeerConnection.inboundTrackIds.filter((tId) => tId !== trackId);
			}
		}

		for (const [trackId, OutboundAudioTrack] of Array.from(updatedOutboundAudioTracks.entries())) {
			if (visitedOutboundAudioTrackIds.has(trackId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, callId, clientId, peerConnectionId } = OutboundAudioTrack;

			if (!serviceId || !callId || !clientId || !peerConnectionId) {
				continue;
			}

			const storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

			updatedOutboundAudioTracks.delete(peerConnectionId);
			deletedOutboundAudioTracks.add(peerConnectionId);

			// also update the peer connection model
			if (storedPeerConnection) {
				storedPeerConnection.outboundTrackIds = storedPeerConnection.outboundTrackIds.filter((tId) => tId !== trackId);
			}
		}

		for (const [trackId, OutboundVideoTrack] of Array.from(updatedOutboundVideoTracks.entries())) {
			if (visitedOutboundVideoTrackIds.has(trackId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, callId, clientId, peerConnectionId } = OutboundVideoTrack;

			if (!serviceId || !callId || !clientId || !peerConnectionId) {
				continue;
			}

			const storedPeerConnection = updatedPeerConnections.get(peerConnectionId);

			updatedOutboundVideoTracks.delete(peerConnectionId);
			deletedOutboundVideoTracks.add(peerConnectionId);

			// also update the peer connection model
			if (storedPeerConnection) {
				storedPeerConnection.outboundTrackIds = storedPeerConnection.outboundTrackIds.filter((tId) => tId !== trackId);
			}
		}
	};
	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await process(context);
		if (next) await next(context);
	};
	return result;
}
