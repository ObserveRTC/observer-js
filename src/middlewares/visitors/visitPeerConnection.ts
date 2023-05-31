import { ObservedPeerConnection } from '../../samples/ObservedPeerConnection';
import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { logger } from '../VisitObservedCallsMiddleware';
import { IceCandidatePairReport, PeerConnectionTransportReport } from '@observertc/report-schemas-js';
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
			userId,
			mediaUnitId,
			...pcTransport,
			timestamp,
			sampleSeq: -1, // deprecated
		};
		reports.addPeerConnectionTransportReports(report);
	}

	for (const iceCandidatePair of observedPeerConnection.iceCandidatePairs()) {
		const report: IceCandidatePairReport = {
			serviceId,
			roomId,
			callId,
			userId,
			clientId,
			mediaUnitId,
			...iceCandidatePair,
			timestamp,
			sampleSeq: -1, // deprecated
		};
		reports.addIceCandidatePairReport(report);
	}

	if (fetchSamples) {
		storedPeerConnection.icelocalCandidates = [];
		for (const iceLocalCandidate of observedPeerConnection.iceLocalCandidates()) {
			const {
				priority,
				...sample
			} = iceLocalCandidate;
			storedPeerConnection.icelocalCandidates.push(new Samples_ClientSample_IceLocalCandidate({
				...sample,
				priority: BigInt(priority ?? -1)
			}));
		}

		storedPeerConnection.iceRemoteCandidates = [];
		for (const iceRemoteCandidate of observedPeerConnection.iceRemoteCandidates()) {
			const {
				priority,
				...sample
			} = iceRemoteCandidate;
			storedPeerConnection.iceRemoteCandidates.push(new Samples_ClientSample_IceRemoteCandidate({
				...sample,
				priority: BigInt(priority ?? -1)
			}));
		}

		storedPeerConnection.iceCandidatePairs = [];
		for (const iceCandidatePair of observedPeerConnection.iceCandidatePairs()) {
			const {
				bytesDiscardedOnSend,
				bytesReceived,
				bytesSent,
				lastPacketReceivedTimestamp,
				lastPacketSentTimestamp,
				...sample
			} = iceCandidatePair;
			storedPeerConnection.iceCandidatePairs.push(new Samples_ClientSample_IceCandidatePair({
				...sample,
				bytesDiscardedOnSend: BigInt(bytesDiscardedOnSend ?? -1),
				bytesReceived: BigInt(bytesReceived ?? -1),
				bytesSent: BigInt(bytesSent ?? -1),
				lastPacketReceivedTimestamp: BigInt(lastPacketReceivedTimestamp ?? -1),
				lastPacketSentTimestamp: BigInt(lastPacketSentTimestamp ?? -1),
			}));
		}

		storedPeerConnection.transports = [];
		for (const pcTransport of observedPeerConnection.transportSamples()) {
			const {
				bytesReceived,
				bytesSent,
				...sample
			} = pcTransport;
			storedPeerConnection.transports.push(new Samples_ClientSample_PeerConnectionTransport({
				...sample,
				bytesReceived: BigInt(bytesReceived ?? -1),
				bytesSent: BigInt(bytesSent ?? -1),
			}));
		}
	}
}
