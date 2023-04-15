import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { SfuOutboundRtpPadReport } from '@observertc/report-schemas-js';
import { ObservedSfuTransport } from '../../samples/ObservedSfuTransport';
import { ObservedSfuOutboundRtpPad } from '../../samples/ObservedSfuOutboundRtpPad';

export function visitSfuOutboundRtpPad(
	observedSfuOutboundRtpPad: ObservedSfuOutboundRtpPad,
	storedSfuTransport: Models.SfuTransport,
	storedSfuOutboundRtpPads: Map<string, Models.SfuOutboundRtpPad>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { padId: rtpPadId } = observedSfuOutboundRtpPad;

	const { transportId: sfuTransportId } = observedSfuOutboundRtpPad.sfuTransport;

	const { serviceId, sfuId, mediaUnitId, marker, minTimestamp: timestamp } = observedSfuOutboundRtpPad.sfuTransport.sfu;

	let storedSfuOutboundRtpPad = storedSfuOutboundRtpPads.get(rtpPadId);
	if (!storedSfuOutboundRtpPad) {
		storedSfuOutboundRtpPad = new Models.SfuOutboundRtpPad({
			serviceId,
			sfuId,
			mediaUnitId,
			sfuTransportId,
			added: BigInt(Date.now()),
			marker,
		});
		storedSfuOutboundRtpPads.set(rtpPadId, storedSfuOutboundRtpPad);

		storedSfuTransport.outboundRtpPadIds.push(rtpPadId);
	}

	for (const sfuOutboundRtpPad of observedSfuOutboundRtpPad.samples()) {
		const report: SfuOutboundRtpPadReport = {
			serviceId,
			sfuId,
			mediaUnitId,
			rtpPadId,
			...sfuOutboundRtpPad,
			sfuStreamId: sfuOutboundRtpPad.streamId,
			sfuSinkId: sfuOutboundRtpPad.sinkId,
			timestamp,
		};
		reports.addSfuTransportReport(report);
	}

	if (fetchSamples) {
	}
}
