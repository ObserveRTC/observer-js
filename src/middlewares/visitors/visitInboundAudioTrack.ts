import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { ObservedInboundAudioTrack } from '../../samples/ObservedInboundAudioTrack';
import { InboundAudioTrackReport } from '@observertc/report-schemas-js';
import { logger } from '../VisitObservedCallsMiddleware';
import { Samples_ClientSample_InboundAudioTrack } from '../../models/samples_pb';

export function visitInboundAudioTrack(
	observedInboundAudioTrack: ObservedInboundAudioTrack,
	storedPeerConnection: Models.PeerConnection,
	storedInboundTracks: Map<string, Models.InboundTrack>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { trackId } = observedInboundAudioTrack;

	const { peerConnectionId } = observedInboundAudioTrack.peerConnection;

	const {
		mediaUnitId,
		clientId,
		userId,
		marker,
		minTimestamp: timestamp,
	} = observedInboundAudioTrack.peerConnection.client;

	const { serviceId, roomId, callId } = observedInboundAudioTrack.peerConnection.client.call;

	let storedInboundAudioTrack = storedInboundTracks.get(trackId);
	if (!storedInboundAudioTrack) {
		storedInboundAudioTrack = new Models.InboundTrack({
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
		storedInboundTracks.set(trackId, storedInboundAudioTrack);
		if (!storedPeerConnection.inboundTrackIds.find((tId) => tId === trackId)) {
			storedPeerConnection.inboundTrackIds.push(trackId);
		} else {
			logger.warn(
				`Attempted to add trackId to storedPeerConnection twice. serviceId: ${serviceId}, callId: ${callId}, clientId: ${clientId}, pcId: ${peerConnectionId}`
			);
		}
	}

	const statsMap = new Map<bigint, Samples_ClientSample_InboundAudioTrack>();

	for (const inboundAudioSample of observedInboundAudioTrack.samples()) {
		const report: InboundAudioTrackReport = {
			serviceId,
			roomId,
			callId,
			clientId,
			mediaUnitId,
			peerConnectionId,
			...inboundAudioSample,
			timestamp,
			sampleSeq: -1,
		};
		reports.addInboundAudioTrackReport(report);

		if (fetchSamples) {
			const {
				ssrc: sample_ssrc,
				bytesReceived: sample_bytesReceived,
				bytesSent: sample_bytesSent,
				estimatedPlayoutTimestamp: samples_estimatedPlayoutTimestamp,
				headerBytesReceived: samples_headerBytesReceived,
				lastPacketReceivedTimestamp: samples_lastPacketReceivedTimestamp,
				remoteTimestamp: samples_remoteTimestamp,
				...sample
			} = inboundAudioSample;

			const ssrc: bigint = BigInt(sample_ssrc);
			const videoStats = new Samples_ClientSample_InboundAudioTrack({
				ssrc,
				bytesReceived: BigInt(sample_bytesReceived ?? -1),
				bytesSent: BigInt(sample_bytesSent ?? -1),
				estimatedPlayoutTimestamp: BigInt(samples_estimatedPlayoutTimestamp ?? -1),
				headerBytesReceived: BigInt(samples_headerBytesReceived ?? -1),
				lastPacketReceivedTimestamp: BigInt(samples_lastPacketReceivedTimestamp ?? -1),
				remoteTimestamp: BigInt(samples_remoteTimestamp ?? -1),
				...sample,
			});

			statsMap.set(ssrc, videoStats);
		}
	}

	storedInboundAudioTrack.videoStats = Array.from(statsMap.values());
}
