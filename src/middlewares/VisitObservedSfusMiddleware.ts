import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { ReportsCollector } from '../common/ReportsCollector';
import { createLogger } from '../common/logger';
import { visitSfu } from './visitors/visitSfu';
import { visitSfuTransport } from './visitors/visitSfuTransport';
import { visitSfuInboundRtpPad } from './visitors/visitSfuInboundRtpPad';
import { visitSfuOutboundRtpPad } from './visitors/visitSfuOutboundRtpPad';
import { visitSfuSctpChannel } from './visitors/visitSfuSctpChannel';

export const logger = createLogger('VisitObservedCallsMiddleware');

export function createVisitObservedSfusMiddleware(
	reports: ReportsCollector,
	fetchSamples: boolean
): Middleware<TransactionContext> {
	const process = (transaction: TransactionContext) => {
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

			updatedSfuSctpChannels,
			deletedSfuSctpChannels

		} = transaction;

		const visitedSfuIds = new Set<string>();
		const visitedSfuTransportIds = new Set<string>();
		const visitedSfuInboundRtpPadIds = new Set<string>();
		const visitedSfuOutboundRtpPadIds = new Set<string>();
		const visitedSfuSctpChannels = new Set<string>();

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

				for (const sfuSctpChannel of observedSfuTransport.sfuSctpChannels()) {
					visitSfuSctpChannel(sfuSctpChannel, storedSfuTransport, updatedSfuSctpChannels, reports, fetchSamples);

					visitedSfuSctpChannels.add(sfuSctpChannel.channelId);
				}
			}
		}

		for (const [ sfuId, sfu ] of Array.from(updatedSfus.entries())) {

			if (visitedSfuIds.has(sfuId)) {
				continue;
			}
			deletedSfus.add(sfuId);

			if (sfu.serviceId && sfu.mediaUnitId) {
				reports.addSfuEventReport({
					serviceId: sfu.serviceId,
					mediaUnitId: sfu.mediaUnitId,
					name: 'SFU_LEFT',
					sfuId,
					timestamp: Date.now(),
					marker: sfu.marker,
					message: 'SFU is detached',
				});
			}
		}

		for (const [ sfuTransportId, sfuTransport ] of Array.from(updatedSfuTransports.entries())) {
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

		for (const [ padId, sfuInboundRtpPad ] of Array.from(updatedSfuInboundRtpPads.entries())) {
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

		for (const [ padId, sfuOutboundRtpPad ] of Array.from(updatedSfuOutboundRtpPads.entries())) {
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

		for (const [ channelId, sfuSctpChannel ] of Array.from(updatedSfuSctpChannels.entries())) {
			if (visitedSfuSctpChannels.has(channelId)) {
				continue;
			}

			// delete Sfu Outbound Rtp Pad
			const { serviceId, sfuSctpChannelId, sfuTransportId } = sfuSctpChannel;

			if (!serviceId || !sfuTransportId || !sfuSctpChannelId) {
				continue;
			}

			const storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

			updatedSfuSctpChannels.delete(sfuSctpChannelId);
			deletedSfuSctpChannels.add(sfuSctpChannelId);

			// also update the sfu transport model
			if (storedSfuTransport) {
				storedSfuTransport.sctpChannelIds = storedSfuTransport.sctpChannelIds.filter((tId) => tId !== sfuSctpChannelId);
			}
		}
	};
	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await process(context);
		if (next) await next(context);
	};
	
	return result;
}
