import { ObservedPeerConnection } from '../../samples/ObservedPeerConnection';
import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { logger } from '../VisitObservedCallsMiddleware';
import { PeerConnectionTransportReport } from '@observertc/report-schemas-js';
import { Samples_ClientSample_IceCandidatePair, Samples_ClientSample_IceLocalCandidate, Samples_ClientSample_IceRemoteCandidate, Samples_ClientSample_PeerConnectionTransport } from '../../models/samples_pb';

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
		storedPeerConnection.icelocalCandidates = [];
		for (const iceLocalCandidate of observedPeerConnection.iceLocalCandidates()) {
			storedPeerConnection.icelocalCandidates.push(new Samples_ClientSample_IceLocalCandidate({
				...iceLocalCandidate,
				priority: BigInt(iceLocalCandidate.priority)
			}));
		}

		storedPeerConnection.iceRemoteCandidates = [];
		for (const iceRemoteCandidate of observedPeerConnection.iceRemoteCandidates()) {
			storedPeerConnection.iceRemoteCandidates.push(new Samples_ClientSample_IceRemoteCandidate({
				...iceRemoteCandidate,
				priority: BigInt(iceRemoteCandidate.priority)
			}));
		}

		storedPeerConnection.iceCandidatePairs = [];
		for (const iceCandidatePair of observedPeerConnection.iceCandidatePairs()) {
			storedPeerConnection.iceCandidatePairs.push(new Samples_ClientSample_IceCandidatePair({
				...iceCandidatePair,
				bytesDiscardedOnSend: BigInt(iceCandidatePair.bytesDiscardedOnSend),
				bytesReceived: BigInt(iceCandidatePair.bytesReceived),
				bytesSent: BigInt(iceCandidatePair.bytesSent),
				lastPacketReceivedTimestamp: BigInt(iceCandidatePair.lastPacketReceivedTimestamp),
				lastPacketSentTimestamp: BigInt(iceCandidatePair.lastPacketSentTimestamp),
			}));
		}

		storedPeerConnection.transports = [];
		for (const pcTransport of observedPeerConnection.transportSamples()) {
			storedPeerConnection.transports.push(new Samples_ClientSample_PeerConnectionTransport({
				...pcTransport,
				bytesReceived: BigInt(pcTransport.bytesReceived),
				bytesSent: BigInt(pcTransport.bytesSent),
			}));
		}
	}
}
