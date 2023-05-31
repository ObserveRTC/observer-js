import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { ObservedOutboundVideoTrack } from '../../samples/ObservedOutboundVideoTrack';
import { OutboundVideoTrackReport } from '@observertc/report-schemas-js';
import { logger } from '../VisitObservedCallsMiddleware';
import { Samples_ClientSample_OutboundVideoTrack } from '../../models/samples_pb';

export function visitOutboundVideoTrack(
	observedOutboundVideoTrack: ObservedOutboundVideoTrack,
	storedPeerConnection: Models.PeerConnection,
	storedOutboundTracks: Map<string, Models.OutboundTrack>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { trackId, sfuStreamId } = observedOutboundVideoTrack;

	const { peerConnectionId } = observedOutboundVideoTrack.peerConnection;

	const {
		mediaUnitId,
		clientId,
		userId,
		marker,
		minTimestamp: timestamp,
	} = observedOutboundVideoTrack.peerConnection.client;

	const { serviceId, roomId, callId } = observedOutboundVideoTrack.peerConnection.client.call;

	let storedOutboundVideoTrack = storedOutboundTracks.get(trackId);
	if (!storedOutboundVideoTrack) {
		storedOutboundVideoTrack = new Models.OutboundTrack({
			serviceId,
			roomId,
			callId,
			clientId,
			kind: 'video',
			peerConnectionId,
			mediaUnitId,
			trackId,

			sfuStreamId,
			userId,
			marker,
		});
		storedOutboundTracks.set(trackId, storedOutboundVideoTrack);
		if (!storedPeerConnection.outboundTrackIds.find((tId) => tId === trackId)) {
			storedPeerConnection.outboundTrackIds.push(trackId);
		} else {
			logger.warn(
				`Attempted to add trackId to storedPeerConnection twice. serviceId: ${serviceId}, callId: ${callId}, clientId: ${clientId}, pcId: ${peerConnectionId}`
			);
		}
	}

	const statsMap = new Map<bigint, Samples_ClientSample_OutboundVideoTrack>();
	for (const outboundVideoSample of observedOutboundVideoTrack.samples()) {
		const report: OutboundVideoTrackReport = {
			serviceId,
			roomId,
			callId,
			clientId,
			userId,
			mediaUnitId,
			peerConnectionId,
			...outboundVideoSample,
			timestamp,
			sampleSeq: -1,
		};
		reports.addOutboundVideoTrackReport(report);

		if (fetchSamples) {
			const {
				ssrc: sample_ssrc,
				bytesSent: sample_bytesSent,
				headerBytesSent: samples_headerBytesSent,
				qpSum: samples_qpSum,
				retransmittedBytesSent: samples_retransmittedBytesSent,
				totalEncodedBytesTarget: samples_totalEncodedBytesTarget,
				...sample
			} = outboundVideoSample;

			const ssrc = BigInt(sample_ssrc);
			const videoStats = new Samples_ClientSample_OutboundVideoTrack({
				ssrc,
				bytesSent: BigInt(sample_bytesSent ?? -1),
				headerBytesSent: BigInt(samples_headerBytesSent ?? -1),
				retransmittedBytesSent: BigInt(samples_retransmittedBytesSent ?? -1),
				totalEncodedBytesTarget: BigInt(samples_totalEncodedBytesTarget ?? -1),
				qpSum: BigInt(samples_qpSum ?? -1),
				...sample,
			});

			statsMap.set(ssrc, videoStats);
		}
	}
	storedOutboundVideoTrack.ssrc = [...statsMap.keys()];
	storedOutboundVideoTrack.videoStats = Array.from(statsMap.values());
}
