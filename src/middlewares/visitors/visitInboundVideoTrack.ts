import { InboundVideoTrackReport } from "@observertc/report-schemas-js";
import { ReportsCollector } from "../../common/ReportsCollector";
import { ObservedInboundVideoTrack } from "../../samples/ObservedInboundVideoTrack";
import { logger } from "../VisitObservedCallsMiddleware";
import * as Models from '../../models/Models';
import { Samples_ClientSample_InboundVideoTrack } from "../../models/samples_pb";

// InboundVideoTrack visitor


export function visitInboundVideoTrack(
	observedInboundVideoTrack: ObservedInboundVideoTrack,
	storedPeerConnection: Models.PeerConnection,
	storedInboundTracks: Map<string, Models.InboundTrack>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const {
		trackId,
	} = observedInboundVideoTrack;

	const {
		peerConnectionLabel,
		peerConnectionId,
	} = observedInboundVideoTrack.peerConnection;

	const {
		mediaUnitId,
		clientId,
		userId,
		marker,
		minTimestamp: timestamp,
	} = observedInboundVideoTrack.peerConnection.client;

	const {
		serviceId,
		roomId,
		callId,
	} = observedInboundVideoTrack.peerConnection.client.call;

	let storedInboundVideoTrack = storedInboundTracks.get(trackId);
	if (!storedInboundVideoTrack) {
		storedInboundVideoTrack = new Models.InboundTrack({
			serviceId,
			roomId,
			callId,
			clientId,
			peerConnectionId,
			mediaUnitId,
			trackId,

			userId,
			marker,
		});
		storedInboundTracks.set(trackId, storedInboundVideoTrack);
		if (!storedPeerConnection.inboundTrackIds.find(tId => tId === trackId)) {
			storedPeerConnection.inboundTrackIds.push(trackId);
		} else {
			logger.warn(`Attempted to add trackId to storedPeerConnection twice. serviceId: ${serviceId}, callId: ${callId}, clientId: ${clientId}, pcId: ${peerConnectionId}`);
		}
	}
	
		const statsMap = new Map<bigint, Samples_ClientSample_InboundVideoTrack>();
		for (const inboundVideoSample of observedInboundVideoTrack.samples()) {
			const report: InboundVideoTrackReport = {
				serviceId,
				roomId,
				callId,
				clientId,
				mediaUnitId,
				peerConnectionId,
				...inboundVideoSample,
				timestamp,
				sampleSeq: -1,
			};
			reports.addInboundVideoTrackReport(report);

			if (fetchSamples) {
				
				const {
					ssrc: sample_ssrc,
					bytesReceived: sample_bytesReceived,
					bytesSent: sample_bytesSent,
					estimatedPlayoutTimestamp: samples_estimatedPlayoutTimestamp,
					headerBytesReceived: samples_headerBytesReceived,
					lastPacketReceivedTimestamp: samples_lastPacketReceivedTimestamp,
					remoteTimestamp: samples_remoteTimestamp,
					qpSum: bytes_qpSum,
					...sample
				} = inboundVideoSample;
				
				const ssrc: bigint = BigInt(sample_ssrc);
				const videoStats = new Samples_ClientSample_InboundVideoTrack({
					ssrc,
					bytesReceived: BigInt(sample_bytesReceived ?? -1),
					bytesSent: BigInt(sample_bytesSent ?? -1),
					estimatedPlayoutTimestamp: BigInt(samples_estimatedPlayoutTimestamp ?? -1),
					headerBytesReceived: BigInt(samples_headerBytesReceived ?? -1),
					lastPacketReceivedTimestamp: BigInt(samples_lastPacketReceivedTimestamp ?? -1),
					remoteTimestamp: BigInt(samples_remoteTimestamp ?? -1),
					qpSum: BigInt(bytes_qpSum ?? -1),
					...sample
				});

				statsMap.set(ssrc, videoStats);
			}
		}
		storedInboundVideoTrack.videoStats = Array.from(statsMap.values());
}
