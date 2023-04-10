import { StorageProvider } from '../storages/StorageProvider';

export type InboundTrackRemoveProcessInput = {
	removedTracks: {
		trackId: string;
		timestamp?: number;
	}[];
};

export function createInboundTrackRemoveProcess(
	storageProvider: StorageProvider
): (input: InboundTrackRemoveProcessInput) => Promise<void> {
	const process = async (input: InboundTrackRemoveProcessInput) => {
		const { removedTracks } = input;
		const { inboundTrackStorage } = storageProvider;
		const inboundTrackIds = removedTracks.map((c) => c.trackId);
		await inboundTrackStorage.removeAll(inboundTrackIds);
	};
	return process;
}
