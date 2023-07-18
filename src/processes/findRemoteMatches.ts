import { createLogger } from "../common/logger";
import { Client, InboundTrack, OutboundTrack, PeerConnection } from "../models/Models";
import { StorageProvider } from "../storages/StorageProvider";

export const logger = createLogger('findRemoteMatches');

function groupToMap<T>(input: ReadonlyMap<string, T>, getGroupKey: (value: T) => string | undefined) {
	const result = new Map<string, T[]>();
	for (const [key, value] of input.entries()) {
		const groupKey = getGroupKey(value);
		if (!groupKey) continue;

	  	let group = result.get(groupKey);
		if (group === undefined) {
			group = [];
			result.set(groupKey, group);
		}
	  	group.push(value);
	}
	return result;
}


export async function findRemoteMatches(
	storages: StorageProvider, 
	clients: ReadonlyMap<string, Client>,
	inboundTracks: ReadonlyMap<string, InboundTrack>,
) {
	const NOT_EXISTS = "NotExists";
	const remoteTrackIds = new Map<string, string>();
	const remotePeerConnectionIds = new Map<string, string>();
	const remoteClientIds = new Map<string, string>();

	async function setupMatches(callId: string, callClients: Client[], callIboundTracks: InboundTrack[]) {
		const peerConnectionIds = Array.from(callClients.values()).flatMap(client => client.peerConnectionIds);
		const peerConnections = await storages.peerConnectionStorage.getAll(peerConnectionIds).catch(err => {
			logger.warn(`Error while fetching for remote matching peer connections for call ${callId} `, err)
			return new Map<string, PeerConnection>() as ReadonlyMap<string, PeerConnection>;
		});
		const outboundTrackIds = Array.from(peerConnections.values()).flatMap(pc => pc.outboundTrackIds);
		const outboundTracks = await storages.outboundTrackStorage.getAll(outboundTrackIds).catch(err => {
			logger.warn(`Error while fetching for remote matching outbound tracks for call ${callId} `, err)
			return new Map<string, OutboundTrack>() as ReadonlyMap<string, OutboundTrack>;
		});
		
		// console.warn("setupMatches", peerConnectionIds, outboundTrackIds, callsClients, callsInbTracks);

		const ssrcToOutb = new Map<bigint, OutboundTrack>();
		const sfuStreamToTrackIds = new Map<string, OutboundTrack>();
		for (const outbTrack of outboundTracks.values()) {
			if (outbTrack.sfuStreamId) {
				sfuStreamToTrackIds.set(outbTrack.sfuStreamId, outbTrack);
			}
			for (const ssrc of outbTrack.ssrc) {
				ssrcToOutb.set(ssrc, outbTrack);
			}
		}
		for (const inbTrack of callIboundTracks) {
			let outbTrack: OutboundTrack | undefined;
			if (inbTrack.sfuStreamId) {
				outbTrack = sfuStreamToTrackIds.get(inbTrack.sfuStreamId);
			} else {
				outbTrack = inbTrack.ssrc.map(ssrc => ssrcToOutb.get(ssrc)).find(outb => outb !== undefined);
			}
			if (outbTrack) {
				remoteTrackIds.set(inbTrack.trackId ?? NOT_EXISTS, outbTrack.trackId ?? NOT_EXISTS);
				remotePeerConnectionIds.set(inbTrack.trackId ?? NOT_EXISTS, outbTrack.peerConnectionId ?? NOT_EXISTS);
				remoteClientIds.set(inbTrack.trackId ?? NOT_EXISTS, outbTrack.clientId ?? NOT_EXISTS);
			}
		}
	}
	const callsClients = groupToMap<Client>(clients, client => client.callId);
	const callsInbTracks = groupToMap<InboundTrack>(inboundTracks, inbTrack => inbTrack.callId)
	
	const promises: Promise<void>[] = [];
	for (const [callId, callClients] of callsClients) {
		const callIboundTracks = callsInbTracks.get(callId) ?? [];
		const promise = setupMatches(
			callId,
			callClients,
			callIboundTracks
		);
		promises.push(promise);
	}
	await Promise.all(promises).catch(err => {
		logger.warn(`Error occurred while fetching remote pair matches`, err);
	});
	return {
		remoteTrackIds,
		remotePeerConnectionIds,
		remoteClientIds
	}
}