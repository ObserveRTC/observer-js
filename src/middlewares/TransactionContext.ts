import { StorageProvider } from "../storages/StorageProvider";
import { createProcessor, Processor } from "./Processor";
import * as Models from '../models/Models';
import { ObservedCalls } from "../samples/ObservedCalls";
import { ReportsCollector } from "../common/ReportsCollector";
import { v4 as uuid } from 'uuid';
import { EvaluatorContext } from "../common/types";
import { Writable } from "../common/utils";

export type TransactionContext = {
	id: string,
	observedCalls: ObservedCalls
	
    clients: ReadonlyMap<string, Models.Client>;
	
	updatedPeerConnections: Map<string, Models.PeerConnection>;
    deletedPeerConnections: Set<string>;
	
	updatedInboundAudioTracks: Map<string, Models.InboundTrack>;
    deletedInboundAudioTracks: Set<string>;
	
	updatedOutboundAudioTracks: Map<string, Models.OutboundTrack>;
	deletedOutboundAudioTracks: Set<string>;
	
	updatedInboundVideoTracks: Map<string, Models.InboundTrack>;
    deletedInboundVideoTracks: Set<string>;
	
	updatedOutboundVideoTracks: Map<string, Models.OutboundTrack>;
	deletedOutboundVideoTracks: Set<string>;
 
	updatedSfus: Map<string, Models.Sfu>;
    deletedSfus: Set<string>;
	
	updatedSfuTransports: Map<string, Models.SfuTransport>;
    deletedSfuTransports: Set<string>;
	
	updatedSfuInboundRtpPads: Map<string, Models.SfuInboundRtpPad>;
    deletedSfuInboundRtpPads: Set<string>;
	
	updatedSfuOutboundRtpPads: Map<string, Models.SfuOutboundRtpPad>;
    deletedSfuOutboundRtpPads: Set<string>;
	
	updatedSfuSctpChannels: Map<string, Models.SfuSctpChannel>;
	deletedSfuSctpChannels: Set<string>;

	// build for another middleware
	evaluatorContext: Writable<Omit<EvaluatorContext, 'observedCalls'>>;
}

export async function createTransactionContext(
	evaluatorContext: EvaluatorContext,
	storageProvider: StorageProvider,
	observedCalls: ObservedCalls,
): Promise<TransactionContext> {
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

	const [
		clients,
		sfus
	] = await Promise.all([
		clientStorage.getAll(observedCalls.clientIds()),
		sfuStorage.getAll([]),
	]);

	const peerConnectionIds = Array.from(clients.values())
		.flatMap(client => client.peerConnectionIds);

	const sfuTransportIds = Array.from(sfus.values())
		.flatMap(sfu => sfu.sfuTransportIds);

	const [
		peerConnections, 
		sfuTransports,
	] = await Promise.all([
		peerConnectionStorage.getAll(peerConnectionIds),
		sfuTransportStorage.getAll(sfuTransportIds),
	]);

	const peerConnectionValues = Array.from(peerConnections.values());
	const inboundTrackIds = peerConnectionValues.flatMap(pc => pc.inboundTrackIds);
	const outboundTrackIds = peerConnectionValues.flatMap(pc => pc.outboundTrackIds);

	const sfuTransportValues = Array.from(sfuTransports.values());
	const sfuInboundRtpPadIds = sfuTransportValues.flatMap(sfuTransport => sfuTransport.inboundRtpPadIds);
	const sfuOutboundRtpPadIds = sfuTransportValues.flatMap(sfuTransport => sfuTransport.outboundRtpPadIds);
	const sfuSctpChannelIds = sfuTransportValues.flatMap(sfuTransport => sfuTransport.sctpChannelIds);

	const [
		inboundTracks,
		outboundTracks,
		sfuInboundRtpPads,
		sfuOutboundRtpPads,
		sfuSctpChannels,
	] = await Promise.all([
		inboundTrackStorage.getAll(inboundTrackIds),
		outboundTrackStorage.getAll(outboundTrackIds),
		sfuInboundRtpPadStorage.getAll(sfuInboundRtpPadIds),
		sfuOutboundRtpPadStorage.getAll(sfuOutboundRtpPadIds),
		sfuSctpChannelStorage.getAll(sfuSctpChannelIds),
	])

	const inboundTrackEntries = Array.from(inboundTracks);
	const outboundTrackEntries = Array.from(outboundTracks);

	const inboundAudioTrackEntries = inboundTrackEntries.filter(e => e[1].kind === 'audio');
	const inboundVideoTrackEntries = inboundTrackEntries.filter(e => e[1].kind === 'video');
	const outboundAudioTrackEntries = outboundTrackEntries.filter(e => e[1].kind === 'audio');
	const outboundVideoTrackEntries = outboundTrackEntries.filter(e => e[1].kind === 'video');

	const transactionContext: TransactionContext = {
		id: uuid(),
		observedCalls,

		clients,
		updatedPeerConnections: new Map<string, Models.PeerConnection>(peerConnections.entries()), 
		deletedPeerConnections: new Set<string>(),

		updatedInboundAudioTracks: new Map<string, Models.InboundTrack>(inboundAudioTrackEntries),
		deletedInboundAudioTracks: new Set<string>(),

		updatedInboundVideoTracks: new Map<string, Models.InboundTrack>(inboundVideoTrackEntries),
		deletedInboundVideoTracks: new Set<string>(),

		updatedOutboundAudioTracks: new Map<string, Models.OutboundTrack>(outboundAudioTrackEntries),
		deletedOutboundAudioTracks: new Set<string>(),

		updatedOutboundVideoTracks: new Map<string, Models.OutboundTrack>(outboundVideoTrackEntries),
		deletedOutboundVideoTracks: new Set<string>(),

		updatedSfus: new Map<string, Models.Sfu>(sfus.entries()),
		deletedSfus: new Set<string>(),

		updatedSfuTransports: new Map<string, Models.SfuTransport>(sfuTransports.entries()),
		deletedSfuTransports: new Set<string>(),

		updatedSfuInboundRtpPads: new Map<string, Models.SfuInboundRtpPad>(sfuInboundRtpPads.entries()),
		deletedSfuInboundRtpPads: new Set<string>(),

		updatedSfuOutboundRtpPads: new Map<string, Models.SfuOutboundRtpPad>(sfuOutboundRtpPads.entries()),
		deletedSfuOutboundRtpPads: new Set<string>(),

		updatedSfuSctpChannels: new Map<string, Models.SfuSctpChannel>(sfuSctpChannels.entries()),
		deletedSfuSctpChannels: new Set<string>(),

		evaluatorContext,
	};
	return transactionContext;
}
