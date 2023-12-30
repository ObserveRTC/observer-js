import * as Models from '../../models/Models';
import { ReportsCollector } from '../../common/ReportsCollector';
import { ObservedSfu } from '../../samples/ObservedSfu';

export function visitSfu(
	observedSfu: ObservedSfu,
	storedSfus: Map<string, Models.Sfu>,
	reports: ReportsCollector,
	fetchSamples: boolean
) {
	const { mediaUnitId, serviceId, sfuId, timeZoneId, marker } = observedSfu;
	let storedSfu = storedSfus.get(sfuId);

	if (!storedSfu) {
		const timestamp = Date.now();

		storedSfu = new Models.Sfu({
			serviceId,
			sfuId,
			joined: BigInt(timestamp),
			mediaUnitId,
			timeZoneId,
			marker,
			sfuTransportIds: [],
		});
		storedSfus.set(sfuId, storedSfu);

		reports.addSfuEventReport({
			serviceId,
			mediaUnitId,
			name: 'SFU_JOINED',
			sfuId,
			timestamp,
			marker,
			message: 'SFU is joined',
		});
	}

	for (const sfuSample of observedSfu.samples()) {

		if (sfuSample.customSfuEvents) {
			for (const sfuEvent of sfuSample.customSfuEvents) {
				reports.addSfuEventReport({
					serviceId,
					mediaUnitId,
					sfuId,
					timestamp: Date.now(),
					...sfuEvent,
				});
			}
		}

		if (sfuSample.extensionStats) {
			for (const extensionStats of sfuSample.extensionStats) {
				reports.addSfuExtensionReport({
					serviceId,
					mediaUnitId,
					sfuId,
					timestamp: Date.now(),
					payload: extensionStats.payload,
					extensionType: extensionStats.type,
				});
			}
		}

		if (fetchSamples) {
			// empty
		}
	}
}
