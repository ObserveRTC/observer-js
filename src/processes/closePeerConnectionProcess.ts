import { StorageProvider } from '../storages/StorageProvider';
import { createInboundTrackRemoveProcess } from './inboundTrackRemoved';
import { createOutboundTrackRemoveProcess } from './outboundTrackRemoved';

export type ClosePeerConnectionProcessInput = {
	closedPeerConnections: {
		peerConnectionId: string;
		closed: number;
	}[];
	recursive: boolean;
};

export function createClosePeerConnectionProcess(
	storageProvider: StorageProvider
): (input: ClosePeerConnectionProcessInput) => Promise<void> {
	const removeInboundTracks = createInboundTrackRemoveProcess(storageProvider);
	const removeOutboundTracks = createOutboundTrackRemoveProcess(storageProvider);
	const process = async (input: ClosePeerConnectionProcessInput) => {
		const { closedPeerConnections, recursive } = input;
		const { peerConnectionStorage } = storageProvider;
		const peerConnectionIds = closedPeerConnections.map((c) => c.peerConnectionId);
		const peerConnections = await peerConnectionStorage.getAll(peerConnectionIds);

		await peerConnectionStorage.removeAll(peerConnectionIds);

		if (recursive) {
			const inboundTrackIds = Array.from(peerConnections.values())
				.flatMap((pc) => pc.inboundTrackIds)
				.map((trackId) => {
					return {
						trackId,
					};
				});
			const outboundTrackIds = Array.from(peerConnections.values())
				.flatMap((pc) => pc.outboundTrackIds)
				.map((trackId) => {
					return {
						trackId,
					};
				});

			await Promise.all([
				removeInboundTracks({
					removedTracks: inboundTrackIds,
				}),
				removeOutboundTracks({
					removedTracks: outboundTrackIds,
				}),
			]);
		}
	};
	
	return process;
}
