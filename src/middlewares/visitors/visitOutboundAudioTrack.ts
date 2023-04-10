import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { ObservedOutboundAudioTrack } from '../../samples/ObservedOutboundAudioTrack';
import { OutboundAudioTrackReport } from '@observertc/report-schemas-js';
import { logger } from '../VisitObservedCallsMiddleware';
import { Samples_ClientSample_OutboundAudioTrack } from '../../models/samples_pb';

export function visitOutboundAudioTrack(
	observedOutboundAudioTrack: ObservedOutboundAudioTrack,
	storedPeerConnection: Models.PeerConnection,
	storedOutboundTracks: Map<string, Models.OutboundTrack>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { trackId } = observedOutboundAudioTrack;

	const { peerConnectionId } = observedOutboundAudioTrack.peerConnection;

	const {
		mediaUnitId,
		clientId,
		userId,
		marker,
		minTimestamp: timestamp,
	} = observedOutboundAudioTrack.peerConnection.client;

	const { serviceId, roomId, callId } = observedOutboundAudioTrack.peerConnection.client.call;

	let storedOutboundAudioTrack = storedOutboundTracks.get(trackId);
	if (!storedOutboundAudioTrack) {
		storedOutboundAudioTrack = new Models.OutboundTrack({
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
		storedOutboundTracks.set(trackId, storedOutboundAudioTrack);
		if (!storedPeerConnection.outboundTrackIds.find((tId) => tId === trackId)) {
			storedPeerConnection.outboundTrackIds.push(trackId);
		} else {
			logger.warn(
				`Attempted to add trackId to storedPeerConnection twice. serviceId: ${serviceId}, callId: ${callId}, clientId: ${clientId}, pcId: ${peerConnectionId}`
			);
		}
	}

	const statsMap = new Map<bigint, Samples_ClientSample_OutboundAudioTrack>();
	for (const outboundAudioSample of observedOutboundAudioTrack.samples()) {
		const report: OutboundAudioTrackReport = {
			serviceId,
			roomId,
			callId,
			clientId,
			mediaUnitId,
			peerConnectionId,
			...outboundAudioSample,
			timestamp,
			sampleSeq: -1,
		};
		reports.addOutboundAudioTrackReport(report);

		if (fetchSamples) {
			const {
				ssrc: sample_ssrc,
				bytesSent: sample_bytesSent,
				headerBytesSent: samples_headerBytesSent,
				retransmittedBytesSent: samples_retransmittedBytesSent,
				totalEncodedBytesTarget: samples_totalEncodedBytesTarget,
				...sample
			} = outboundAudioSample;

			const ssrc = BigInt(sample_ssrc);
			const audioStats = new Samples_ClientSample_OutboundAudioTrack({
				ssrc,
				bytesSent: BigInt(sample_bytesSent ?? -1),
				headerBytesSent: BigInt(samples_headerBytesSent ?? -1),
				retransmittedBytesSent: BigInt(samples_retransmittedBytesSent ?? -1),
				totalEncodedBytesTarget: BigInt(samples_totalEncodedBytesTarget ?? -1),
				...sample,
			});

			statsMap.set(ssrc, audioStats);
		}
	}
	storedOutboundAudioTrack.audioStats = Array.from(statsMap.values());
}
