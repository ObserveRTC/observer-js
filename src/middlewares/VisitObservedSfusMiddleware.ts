import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { ReportsCollector } from '../common/ReportsCollector';
import { visitClient } from './visitors/visitClient';
import { visitPeerConnection } from './visitors/visitPeerConnection';
import { createLogger } from '../common/logger';
import { visitInboundAudioTrack } from './visitors/visitInboundAudioTrack';
import { visitOutboundAudioTrack } from './visitors/visitOutboundAudioTrack';
import { visitOutboundVideoTrack } from './visitors/visitOutboundVideoTarcks';
import { visitSfu } from './visitors/visitSfu';
import { visitSfuTransport } from './visitors/visitSfuTransport';
import { visitSfuInboundRtpPad } from './visitors/visitSfuInboundRtpPad';
import { visitSfuOutboundRtpPad } from './visitors/visitSfuOutboundRtpPad';

export const logger = createLogger('VisitObservedCallsMiddleware');

export function createVisitObservedSfusMiddleware(
	reports: ReportsCollector,
	fetchSamples: boolean
): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
			observedSfus,
			updatedSfus,
			deletedSfus,

			updatedSfuTransports,
			deletedSfuTransports,

			updatedSfuInboundRtpPads,
			deletedSfuInboundRtpPads,

			updatedSfuOutboundRtpPads,
			deletedSfuOutboundRtpPads,

		} = transaction;

		const visitedSfuIds = new Set<string>();
		const visitedSfuTransportIds = new Set<string>();
		const visitedSfuInboundRtpPadIds = new Set<string>();
		const visitedSfuOutboundRtpPadIds = new Set<string>();

		for (const observedSfu of observedSfus.observedSfus()) {
			const { sfuId } = observedSfu;

			visitSfu(observedSfu, updatedSfus, reports, fetchSamples);
			
			visitedSfuIds.add(sfuId);
			const storedSfu = updatedSfus.get(sfuId);

			if (!storedSfu) {
				continue;
			}

			for (const observedSfuTransport of observedSfu.observedSfuTransports()) {
				const { transportId } = observedSfuTransport;

				visitSfuTransport(observedSfuTransport, storedSfu, updatedSfuTransports, reports, fetchSamples);

				visitedSfuTransportIds.add(transportId);
				const storedSfuTransport = updatedSfuTransports.get(transportId);

				if (!storedSfuTransport) {
					continue;
				}

				for (const sfuInboundRtpPad of observedSfuTransport.inboundRtpPads()) {
					visitSfuInboundRtpPad(sfuInboundRtpPad, storedSfuTransport, updatedSfuInboundRtpPads, reports, fetchSamples);

					visitedSfuInboundRtpPadIds.add(sfuInboundRtpPad.padId);
				}

				for (const sfuOutboundRtpPad of observedSfuTransport.outboundRtpPads()) {
					visitSfuOutboundRtpPad(sfuOutboundRtpPad, storedSfuTransport, updatedSfuOutboundRtpPads, reports, fetchSamples);

					visitedSfuInboundRtpPadIds.add(sfuOutboundRtpPad.padId);
				}
			}
		}

		for (const [sfuId, sfu] of Array.from(updatedSfus.entries())) {

			if (visitedSfuIds.has(sfuId)) {
				continue;
			}
			deletedSfus.add(sfuId);

			if (sfu.serviceId && sfu.mediaUnitId) {
				reports.addSfuEventReport({
					serviceId: sfu.serviceId,
					mediaUnitId: sfu.mediaUnitId,
					name: "SFU_LEFT",
					sfuId,
					timestamp: Date.now(),
					marker: sfu.marker,
					message: 'SFU is detached',
				});
			}
		}

		for (const [sfuTransportId, sfuTransport] of Array.from(updatedSfuTransports.entries())) {
			if (visitedSfuTransportIds.has(sfuTransportId)) {
				continue;
			}
			// delete PeerConnection
			const { serviceId, sfuId, transportId } = sfuTransport;

			if (!serviceId || !sfuId || !transportId) {
				continue;
			}

			const storedSfu = updatedSfus.get(sfuId);

			updatedSfuTransports.delete(transportId);
			deletedSfuTransports.add(transportId);

			// also update the peer connection model
			if (storedSfu) {
				storedSfu.sfuTransportIds = storedSfu.sfuTransportIds.filter((tId) => tId !== transportId);
			}
		}

		for (const [padId, sfuInboundRtpPad] of Array.from(updatedSfuInboundRtpPads.entries())) {
			if (visitedSfuInboundRtpPadIds.has(padId)) {
				continue;
			}
			// delete Sfu Inbound Rtp Pad
			const { serviceId, rtpPadId, sfuTransportId } = sfuInboundRtpPad;

			if (!serviceId || !sfuTransportId || !rtpPadId) {
				continue;
			}

			const storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

			updatedSfuInboundRtpPads.delete(rtpPadId);
			deletedSfuInboundRtpPads.add(rtpPadId);

			// also update the sfu transport model
			if (storedSfuTransport) {
				storedSfuTransport.inboundRtpPadIds = storedSfuTransport.inboundRtpPadIds.filter((tId) => tId !== rtpPadId);
			}
		}

		for (const [padId, sfuOutboundRtpPad] of Array.from(updatedSfuOutboundRtpPads.entries())) {
			if (visitedSfuOutboundRtpPadIds.has(padId)) {
				continue;
			}

			// delete Sfu Outbound Rtp Pad
			const { serviceId, rtpPadId, sfuTransportId } = sfuOutboundRtpPad;

			if (!serviceId || !sfuTransportId || !rtpPadId) {
				continue;
			}

			const storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

			updatedSfuOutboundRtpPads.delete(rtpPadId);
			deletedSfuOutboundRtpPads.add(rtpPadId);

			// also update the sfu transport model
			if (storedSfuTransport) {
				storedSfuTransport.outboundRtpPadIds = storedSfuTransport.outboundRtpPadIds.filter((tId) => tId !== rtpPadId);
			}
		}
	};
	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await process(context);
		if (next) await next(context);
	};
	return result;
}
