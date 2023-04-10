import { createLogger } from '../common/logger';
import { EvaluatorContext } from '../common/types';
import { ObservedCall } from '../samples/ObservedCall';
import { ObservedCalls } from '../samples/ObservedCalls';
import { ObservedClient } from '../samples/ObservedClient';
import { ObservedPeerConnection } from '../samples/ObservedPeerConnection';
import { createPeerConnectionOpenedEventReport } from '../sinks/callEventReports';
import { ObserverStorage } from '../storages/ObserverStorage';
import { StorageProvider } from '../storages/StorageProvider';
import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';

const logger = createLogger('CallUpdateMiddleware');

export function createCommitTransactionMiddleware(storageProvider: StorageProvider): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
			clientStorage,
			peerConnectionStorage,
			inboundTrackStorage,
			outboundTrackStorage,
			sfuStorage,
			sfuTransportStorage,
			sfuInboundRtpPadStorage,
			sfuOutboundRtpPadStorage,
			sfuSctpChannelStorage,
		} = storageProvider;

		const {
			clients,
			updatedPeerConnections,
			deletedPeerConnections,
			updatedInboundAudioTracks,
			deletedInboundAudioTracks,
			updatedInboundVideoTracks,
			deletedInboundVideoTracks,
			updatedOutboundAudioTracks,
			deletedOutboundAudioTracks,
			updatedOutboundVideoTracks,
			deletedOutboundVideoTracks,
			updatedSfus,
			deletedSfus,
			updatedSfuTransports,
			deletedSfuTransports,
			updatedSfuInboundRtpPads,
			deletedSfuInboundRtpPads,
			updatedSfuOutboundRtpPads,
			deletedSfuOutboundRtpPads,
			updatedSfuSctpChannels,
			deletedSfuSctpChannels,

			evaluatorContext,
		} = transaction;

		const emptyMap = new Map();

		// Ensure updates are disjointed!

		for (const deletedPeerConnectionId of deletedPeerConnections) {
			if (updatedPeerConnections.has(deletedPeerConnectionId)) {
				logger.warn(
					`Updated PeerConnection held a peerConnectionId for deletedPeerConnections. Transaction ${transaction.id}`
				);
				updatedPeerConnections.delete(deletedPeerConnectionId);
			}
		}

		for (const deletedInboundTrackId of deletedInboundAudioTracks) {
			if (updatedInboundAudioTracks.has(deletedInboundTrackId)) {
				logger.warn(
					`Updated InboundAudioTrack held an inboundAudioTrackId for deletedInboundAudioTracks. Transaction ${transaction.id}`
				);
				updatedInboundAudioTracks.delete(deletedInboundTrackId);
			}
		}

		for (const deletedInboundTrackId of deletedInboundVideoTracks) {
			if (updatedInboundVideoTracks.has(deletedInboundTrackId)) {
				logger.warn(
					`Updated InboundVideoTrack held an inboundVideoTrackId for deletedInboundVideoTracks. Transaction ${transaction.id}`
				);
				updatedInboundVideoTracks.delete(deletedInboundTrackId);
			}
		}

		for (const deletedOutboundTrackId of deletedOutboundAudioTracks) {
			if (updatedOutboundAudioTracks.has(deletedOutboundTrackId)) {
				logger.warn(
					`Updated OutboundAudioTrack held an outboundAudioTrackId for deletedOutboundAudioTracks. Transaction ${transaction.id}`
				);
				updatedOutboundAudioTracks.delete(deletedOutboundTrackId);
			}
		}

		for (const deletedOutboundTrackId of deletedOutboundVideoTracks) {
			if (updatedOutboundVideoTracks.has(deletedOutboundTrackId)) {
				logger.warn(
					`Updated OutboundVideoTrack held an outboundVideoTrackId for deletedOutboundVideoTracks. Transaction ${transaction.id}`
				);
				updatedOutboundVideoTracks.delete(deletedOutboundTrackId);
			}
		}

		for (const deletedSfuId of deletedSfus) {
			if (updatedSfus.has(deletedSfuId)) {
				logger.warn(`Updated Sfu held an sfuId for deletedSfus. Transaction ${transaction.id}`);
				updatedSfus.delete(deletedSfuId);
			}
		}

		for (const deletedSfuTransportId of deletedSfuTransports) {
			if (updatedSfuTransports.has(deletedSfuTransportId)) {
				logger.warn(
					`Updated SfuTransport held an sfuTransportId for deletedSfuTransports. Transaction ${transaction.id}`
				);
				updatedSfuTransports.delete(deletedSfuTransportId);
			}
		}

		for (const deletedSfuInboundRtpPadId of deletedSfuInboundRtpPads) {
			if (updatedSfuInboundRtpPads.has(deletedSfuInboundRtpPadId)) {
				logger.warn(
					`Updated SfuInboundRtpPad held an updatedSfuInboundRtpPadId for deletedSfuInboundRtpPads. Transaction ${transaction.id}`
				);
				updatedSfuInboundRtpPads.delete(deletedSfuInboundRtpPadId);
			}
		}

		for (const deletedSfuOutboundRtpPadId of deletedSfuOutboundRtpPads) {
			if (updatedSfuOutboundRtpPads.has(deletedSfuOutboundRtpPadId)) {
				logger.warn(
					`Updated SfuOutboundRtpPad held an updatedSfuOutboundRtpPadId for deletedSfuOutboundRtpPads. Transaction ${transaction.id}`
				);
				updatedSfuOutboundRtpPads.delete(deletedSfuOutboundRtpPadId);
			}
		}

		for (const deletedSfuSctpChannelId of deletedSfuSctpChannels) {
			if (updatedSfuSctpChannels.has(deletedSfuSctpChannelId)) {
				logger.warn(
					`Updated SfuSctpChannelId held an deletedSfuSctpChannelId for deletedSfuSctpChannels. Transaction ${transaction.id}`
				);
				updatedSfuSctpChannels.delete(deletedSfuSctpChannelId);
			}
		}

		const promiseSetAll = <K, V>(storage: ObserverStorage<K, V>, input: ReadonlyMap<K, V>) => {
			if (0 < input.size) {
				return storage.setAll(input);
			} else {
				return Promise.resolve<ReadonlyMap<K, V>>(emptyMap);
			}
		};

		const promiseRemoveAll = <K, V>(storage: ObserverStorage<K, V>, input: ReadonlySet<K>) => {
			if (0 < input.size) {
				return storage.removeAll(input);
			} else {
				return Promise.resolve<ReadonlyMap<K, V>>(emptyMap);
			}
		};

		const [
			[
				oldClientModels,
				oldPeerConnectionModels,
				oldInboundAudioTrackModels,
				oldInboundVideoTrackModels,
				oldOutboundAudioTrackModels,
				oldOutboundVideoTrackModels,
			],
			[
				removedPeerConnectionModels,
				removedInboundAudioTrackModels,
				removedInboundVideoTrackModels,
				removedOutboundAudioTrackModels,
				removedOutboundVideoTrackModels,
			],
			[
				oldSfuModels,
				oldSfuTransportModels,
				oldSfuInboundRtpPadModels,
				oldSfuOutboundRtpPadModels,
				oldSfuSctpChannelModels,
			],
			[
				removedSfuModels,
				removedSfuTransportModels,
				removedSfuInboundRtpPadModels,
				removedSfuOutboundRtpPadModels,
				removedSfuSctpChannelModels,
			],
		] = await Promise.all([
			// Call related updates
			Promise.all([
				promiseSetAll(clientStorage, clients),
				promiseSetAll(peerConnectionStorage, updatedPeerConnections),
				promiseSetAll(inboundTrackStorage, updatedInboundAudioTracks),
				promiseSetAll(inboundTrackStorage, updatedInboundVideoTracks),
				promiseSetAll(outboundTrackStorage, updatedOutboundAudioTracks),
				promiseSetAll(outboundTrackStorage, updatedOutboundVideoTracks),
			]),
			Promise.all([
				promiseRemoveAll(peerConnectionStorage, deletedPeerConnections),
				promiseRemoveAll(inboundTrackStorage, deletedInboundAudioTracks),
				promiseRemoveAll(inboundTrackStorage, deletedInboundVideoTracks),
				promiseRemoveAll(outboundTrackStorage, deletedOutboundAudioTracks),
				promiseRemoveAll(outboundTrackStorage, deletedOutboundVideoTracks),
			]),

			// Sfu related updates
			Promise.all([
				promiseSetAll(sfuStorage, updatedSfus),
				promiseSetAll(sfuTransportStorage, updatedSfuTransports),
				promiseSetAll(sfuInboundRtpPadStorage, updatedSfuInboundRtpPads),
				promiseSetAll(sfuOutboundRtpPadStorage, updatedSfuOutboundRtpPads),
				promiseSetAll(sfuSctpChannelStorage, updatedSfuSctpChannels),
			]),
			Promise.all([
				promiseRemoveAll(sfuStorage, deletedSfus),
				promiseRemoveAll(sfuTransportStorage, deletedSfuTransports),
				promiseRemoveAll(sfuInboundRtpPadStorage, deletedSfuInboundRtpPads),
				promiseRemoveAll(sfuOutboundRtpPadStorage, deletedSfuOutboundRtpPads),
				promiseRemoveAll(sfuSctpChannelStorage, deletedSfuSctpChannels),
			]),
		]);

		const removedUnits = <K, V>(removedModels: ReadonlyMap<K, V>) => {
			return Array.from(removedModels.values()).map((o) => {
				return {
					...o,
					removed: Date.now(),
				};
			});
		};
		const addedUnits = <K, V>(oldItems: ReadonlyMap<K, V>, updatedItems: ReadonlyMap<K, V>) => {
			const oldSet = new Set<K>(oldItems.keys());
			return Array.from(updatedItems.keys()).filter((updatedKey) => !oldSet.has(updatedKey));
		};

		evaluatorContext.openedPeerConnectionIds.push(...addedUnits(oldPeerConnectionModels, updatedPeerConnections));
		evaluatorContext.closedPeerConnections.push(
			...Array.from(removedPeerConnectionModels.values()).map((o) => {
				return {
					...o,
					closed: Date.now(),
				};
			})
		);

		evaluatorContext.removedInboundAudioTracks.push(...removedUnits(removedInboundAudioTrackModels));
		evaluatorContext.addedInboundAudioTrackIds.push(
			...addedUnits(oldInboundAudioTrackModels, updatedInboundAudioTracks)
		);

		evaluatorContext.removedInboundVideoTracks.push(...removedUnits(removedInboundVideoTrackModels));
		evaluatorContext.addedInboundVideoTrackIds.push(
			...addedUnits(oldInboundVideoTrackModels, updatedInboundVideoTracks)
		);

		evaluatorContext.removedOutboundAudioTracks.push(...removedUnits(removedOutboundAudioTrackModels));
		evaluatorContext.addedOutboundAudioTrackIds.push(
			...addedUnits(oldOutboundAudioTrackModels, updatedOutboundAudioTracks)
		);

		evaluatorContext.removedOutboundVideoTracks.push(...removedUnits(removedOutboundVideoTrackModels));
		evaluatorContext.addedOutboundVideoTrackIds.push(
			...addedUnits(oldOutboundVideoTrackModels, updatedOutboundVideoTracks)
		);
	};

	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await Promise.all([process(context), next ? next(context) : Promise.resolve()]);
	};
	return result;
}
