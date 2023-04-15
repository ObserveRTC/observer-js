import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { SfuInboundRtpPadReport } from '@observertc/report-schemas-js';
import { ObservedSfuInboundRtpPad } from '../../samples/ObservedSfuInboundRtpPad';

export function visitSfuInboundRtpPad(
	observedSfuInboundRtpPad: ObservedSfuInboundRtpPad,
	storedSfuTransport: Models.SfuTransport,
	storedSfuInboundRtpPads: Map<string, Models.SfuInboundRtpPad>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { padId: rtpPadId } = observedSfuInboundRtpPad;

	const { transportId: sfuTransportId } = observedSfuInboundRtpPad.sfuTransport;

	const { serviceId, sfuId, mediaUnitId,  marker, minTimestamp: timestamp } = observedSfuInboundRtpPad.sfuTransport.sfu;


	let storedSfuInboundRtpPad = storedSfuInboundRtpPads.get(rtpPadId);
	if (!storedSfuInboundRtpPad) {
		storedSfuInboundRtpPad = new Models.SfuInboundRtpPad({
			serviceId,
			sfuId,
			mediaUnitId,
			sfuTransportId,
			added: BigInt(Date.now()),
			marker,
		});
		storedSfuInboundRtpPads.set(rtpPadId, storedSfuInboundRtpPad);

		storedSfuTransport.inboundRtpPadIds.push(rtpPadId);
	}

	for (const sfuInboundRtpPad of observedSfuInboundRtpPad.samples()) {
		const report: SfuInboundRtpPadReport = {
			serviceId,
			sfuId,
			mediaUnitId,
			rtpPadId,
			...sfuInboundRtpPad,
			sfuStreamId: sfuInboundRtpPad.streamId,
			timestamp,
		};
		reports.addSfuTransportReport(report);
	}

	if (fetchSamples) {
	}
}
