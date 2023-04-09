import { StorageProvider } from "../storages/StorageProvider";

export type OutboundTrackRemoveProcessInput = {
    removedTracks: {
		trackId: string,
		timestamp?: number
	}[],
}

export function createOutboundTrackRemoveProcess(
    storageProvider: StorageProvider,
): (input: OutboundTrackRemoveProcessInput) => Promise<void> {
    const process = async (input: OutboundTrackRemoveProcessInput) => {
        const { removedTracks } = input;
		const { outboundTrackStorage } = storageProvider;
		const outboundTrackIds = removedTracks.map(c => c.trackId);
        await outboundTrackStorage.removeAll(outboundTrackIds);
    };
    return process;
}
