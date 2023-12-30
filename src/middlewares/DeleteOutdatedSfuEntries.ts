import { Middleware } from './Middleware';
import { TransactionContext } from './TransactionContext';
import { createLogger } from '../common/logger';
import { StorageProvider } from '..';

export const logger = createLogger('DeleteOutdatedSfuEntries');

export function createDeleteOutdatedSfuEntries(
	storages: StorageProvider,
	maxIdleTimeInMs: bigint,
): Middleware<TransactionContext> {
	const process = async (transaction: TransactionContext) => {
		const {
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

		const now = BigInt(Date.now());

		for (const [ sfuTransportId, sfuTransport ] of storages.sfuTransportStorage.localEntries()) {
			if (updatedSfuTransports.has(sfuTransportId)) {
				continue;
			}
			
			const { touched, sfuId } = sfuTransport;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (!deletedSfus.has(sfuId ?? 'not exists')) {
					continue;
				}
			}

			deletedSfuTransports.add(sfuTransportId);

			if (sfuId) {
				let storedSfu = updatedSfus.get(sfuId);

				if (storedSfu) {
					storedSfu.sfuTransportIds = storedSfu.sfuTransportIds.filter((transportId) => transportId !== sfuTransportId);
				} else {
					storedSfu = await storages.sfuStorage.get(sfuId);
					if (storedSfu) {
						storedSfu.sfuTransportIds = storedSfu.sfuTransportIds.filter((transportId) => transportId !== sfuTransportId);
						await storages.sfuStorage.set(sfuId, storedSfu);
					}
				}
			}
		}

		for (const [ sfuInboundPadId, sfuInboundPad ] of storages.sfuInboundRtpPadStorage.localEntries()) {
			if (updatedSfuInboundRtpPads.has(sfuInboundPadId)) {
				continue;
			}

			const { touched, sfuTransportId, sfuId } = sfuInboundPad;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedSfuTransports.has(sfuTransportId ?? 'not exists') && 
					!deletedSfus.has(sfuId ?? 'not exists')
				) {
					continue;
				}
			}

			deletedSfuInboundRtpPads.add(sfuInboundPadId);

			if (sfuTransportId) {
				let storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

				if (!storedSfuTransport) {
					storedSfuTransport = await storages.sfuTransportStorage.get(sfuTransportId);
					if (storedSfuTransport) {
						updatedSfuTransports.set(sfuTransportId, storedSfuTransport);
					}
				}
				if (storedSfuTransport) {
					storedSfuTransport.inboundRtpPadIds = storedSfuTransport.inboundRtpPadIds.filter((tId) => tId !== sfuInboundPadId);
				}
			}
		}

		for (const [ sfuOutboundPadId, sfuOutboundPad ] of storages.sfuOutboundRtpPadStorage.localEntries()) {
			if (updatedSfuOutboundRtpPads.has(sfuOutboundPadId)) {
				continue;
			}

			const { touched, sfuTransportId, sfuId } = sfuOutboundPad;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedSfuTransports.has(sfuTransportId ?? 'not exists') && 
					!deletedSfus.has(sfuId ?? 'not exists')
				) {
					continue;
				}
			}

			deletedSfuOutboundRtpPads.add(sfuOutboundPadId);

			if (sfuTransportId) {
				let storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

				if (!storedSfuTransport) {
					storedSfuTransport = await storages.sfuTransportStorage.get(sfuTransportId);
					if (storedSfuTransport) {
						updatedSfuTransports.set(sfuTransportId, storedSfuTransport);
					}
				}
				if (storedSfuTransport) {
					storedSfuTransport.outboundRtpPadIds = storedSfuTransport.outboundRtpPadIds.filter((tId) => tId !== sfuOutboundPadId);
				}
			}
		}

		for (const [ sctpChannelId, sctpChannel ] of storages.sfuSctpChannelStorage.localEntries()) {
			if (updatedSfuSctpChannels.has(sctpChannelId)) {
				continue;
			}

			const { touched, sfuTransportId, sfuId } = sctpChannel;

			if (touched && now - touched < maxIdleTimeInMs) {
				if (
					!deletedSfuTransports.has(sfuTransportId ?? 'not exists') && 
					!deletedSfus.has(sfuId ?? 'not exists')
				) {
					continue;
				}
			}

			deletedSfuSctpChannels.add(sctpChannelId);

			if (sfuTransportId) {
				let storedSfuTransport = updatedSfuTransports.get(sfuTransportId);

				if (!storedSfuTransport) {
					storedSfuTransport = await storages.sfuTransportStorage.get(sfuTransportId);
					if (storedSfuTransport) {
						updatedSfuTransports.set(sfuTransportId, storedSfuTransport);
					}
				}
				if (storedSfuTransport) {
					storedSfuTransport.sctpChannelIds = storedSfuTransport.sctpChannelIds.filter((tId) => tId !== sctpChannelId);
				}
			}
		}
	};
	const result = async (context: TransactionContext, next?: Middleware<TransactionContext>) => {
		await process(context);
		if (next) await next(context);
	};
	
	return result;
}
