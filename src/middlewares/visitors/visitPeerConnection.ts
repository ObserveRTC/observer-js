import { ObservedPeerConnection } from '../../samples/ObservedPeerConnection';
import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { logger } from '../VisitObservedCallsMiddleware';
import { PeerConnectionTransportReport } from '@observertc/report-schemas-js';

export function visitPeerConnection(
	observedPeerConnection: ObservedPeerConnection,
	storedClient: Models.Client,
	storedPeerConnections: Map<string, Models.PeerConnection>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { peerConnectionLabel, peerConnectionId } = observedPeerConnection;

	const { mediaUnitId, clientId, userId, marker, minTimestamp: timestamp } = observedPeerConnection.client;

	const { serviceId, roomId, callId } = observedPeerConnection.client.call;

	let storedPeerConnection = storedPeerConnections.get(peerConnectionId);
	if (!storedPeerConnection) {
		storedPeerConnection = new Models.PeerConnection({
			serviceId,
			roomId,
			callId,
			clientId,
			peerConnectionId,
			mediaUnitId,

			// opened
			userId,
			marker,
			label: peerConnectionLabel,
		});
		storedPeerConnections.set(peerConnectionId, storedPeerConnection);
		if (!storedClient.peerConnectionIds.find((pcId) => pcId === peerConnectionId)) {
			storedClient.peerConnectionIds.push(peerConnectionId);
		} else {
			logger.warn(``);
		}
	}

	for (const pcTransport of observedPeerConnection.transportSamples()) {
		const report: PeerConnectionTransportReport = {
			serviceId,
			roomId,
			callId,
			clientId,
			mediaUnitId,
			...pcTransport,
			timestamp,
			sampleSeq: -1, // deprecated
		};
		reports.addPeerConnectionTransportReports(report);
	}

	if (fetchSamples) {
		for (const iceLocalCandidate of observedPeerConnection.iceLocalCandidates()) {
			// iceLocalCandidate.id
		}

		for (const iceRemoteCandidate of observedPeerConnection.iceRemoteCandidates()) {
			// iceRemoteCandidates
		}

		for (const iceCandidatePair of observedPeerConnection.iceCandidatePairs()) {
			// iceCandidatePair
		}
	}
}
