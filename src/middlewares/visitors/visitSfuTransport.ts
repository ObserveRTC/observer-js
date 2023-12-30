import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { SFUTransportReport } from '@observertc/report-schemas-js';
import { ObservedSfuTransport } from '../../samples/ObservedSfuTransport';

export function visitSfuTransport(
	observedSfuTransport: ObservedSfuTransport,
	storedSfu: Models.Sfu,
	storedSfuTransports: Map<string, Models.SfuTransport>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { transportId } = observedSfuTransport;

	const { serviceId, sfuId, mediaUnitId, marker, minTimestamp: timestamp } = observedSfuTransport.sfu;

	let storedSfuTransport = storedSfuTransports.get(transportId);

	if (!storedSfuTransport) {
		storedSfuTransport = new Models.SfuTransport({
			serviceId,
			sfuId,
			mediaUnitId,
			transportId,
			opened: BigInt(Date.now()),
			marker,
			inboundRtpPadIds: [],
			outboundRtpPadIds: [],
		});
		storedSfuTransports.set(transportId, storedSfuTransport);

		storedSfu.sfuTransportIds.push(transportId);
	}

	for (const sfuTransport of observedSfuTransport.transportSamples()) {
		const report: SFUTransportReport = {
			serviceId,
			sfuId,
			mediaUnitId,
			...sfuTransport,
			timestamp,
		};

		reports.addSfuTransportReport(report);
	}

	if (fetchSamples) {
		// empty
	}
}
