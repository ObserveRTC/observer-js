import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { SfuSctpStreamReport } from '@observertc/report-schemas-js';
import { ObservedSfuSctpChannel } from '../../samples/ObservedSfuSctpChannel';

export function visitSfuSctpChannel(
	observedSfuSctpChannel: ObservedSfuSctpChannel,
	storedSfuTransport: Models.SfuTransport,
	storedSfuSctpChannels: Map<string, Models.SfuSctpChannel>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { channelId } = observedSfuSctpChannel;
  
	const { transportId: sfuTransportId } = observedSfuSctpChannel.sfuTransport;
  
	const { serviceId, sfuId, mediaUnitId, marker, minTimestamp: timestamp } = observedSfuSctpChannel.sfuTransport.sfu;
  
	let storedSfuSctpChannel = storedSfuSctpChannels.get(channelId);

	if (!storedSfuSctpChannel) {
		storedSfuSctpChannel = new Models.SfuSctpChannel({
			serviceId,
			sfuId,
			mediaUnitId,
			sfuTransportId,
			opened: BigInt(Date.now()),
			marker,
		});
		storedSfuSctpChannels.set(channelId, storedSfuSctpChannel);
  
		storedSfuTransport.sctpChannelIds.push(channelId);
	}
  
	for (const sfuSctpChannel of observedSfuSctpChannel.samples()) {
		const report: SfuSctpStreamReport = {
			serviceId,
			sfuId,
			mediaUnitId,
			...sfuSctpChannel,
			timestamp,
		};

		reports.addSfuTransportReport(report);
	}
  
	if (fetchSamples) {
		// empty
	}
}
