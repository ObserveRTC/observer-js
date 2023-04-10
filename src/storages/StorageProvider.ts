import { StorageFactory } from './StorageFactory';
import { ObserverStorage } from './ObserverStorage';
import * as Models from '../models/Models';
import { SimpleStorage } from './SimpleStorage';

export interface StorageProvider {
	readonly callStorage: ObserverStorage<string, Models.Call>;
	readonly clientStorage: ObserverStorage<string, Models.Client>;
	readonly peerConnectionStorage: ObserverStorage<string, Models.PeerConnection>;
	readonly inboundTrackStorage: ObserverStorage<string, Models.InboundTrack>;
	readonly outboundTrackStorage: ObserverStorage<string, Models.OutboundTrack>;
	readonly sfuStorage: ObserverStorage<string, Models.Sfu>;
	readonly sfuTransportStorage: ObserverStorage<string, Models.SfuTransport>;
	readonly sfuInboundRtpPadStorage: ObserverStorage<string, Models.SfuInboundRtpPad>;
	readonly sfuOutboundRtpPadStorage: ObserverStorage<string, Models.SfuOutboundRtpPad>;
	readonly sfuSctpChannelStorage: ObserverStorage<string, Models.SfuSctpChannel>;
}

export function createSimpleStorageProvider(): StorageProvider {
	const callStorage = new SimpleStorage<string, Models.Call>('ObserverCallStorage');
	const clientStorage = new SimpleStorage<string, Models.Client>('ObserverClientStorage');
	const peerConnectionStorage = new SimpleStorage<string, Models.PeerConnection>('ObserverPeerConnectionStorage');
	const inboundTrackStorage = new SimpleStorage<string, Models.InboundTrack>('ObserverInboundTrackStorage');
	const outboundTrackStorage = new SimpleStorage<string, Models.OutboundTrack>('ObserverOutboundTrackStorage');
	const sfuStorage = new SimpleStorage<string, Models.Sfu>('ObserverSfuStorage');
	const sfuTransportStorage = new SimpleStorage<string, Models.SfuTransport>('ObserverSfuTransportStorage');
	const sfuInboundRtpPadStorage = new SimpleStorage<string, Models.SfuInboundRtpPad>('ObserverSfuInboundRtpPadStorage');
	const sfuOutboundRtpPadStorage = new SimpleStorage<string, Models.SfuOutboundRtpPad>(
		'ObserverSfuOutboundRtpPadStorage'
	);
	const sfuSctpChannelStorage = new SimpleStorage<string, Models.SfuSctpChannel>('ObserverSfuSctpChannelStorage');

	return {
		callStorage,
		clientStorage,
		peerConnectionStorage,
		inboundTrackStorage,
		outboundTrackStorage,
		sfuStorage,
		sfuTransportStorage,
		sfuInboundRtpPadStorage,
		sfuOutboundRtpPadStorage,
		sfuSctpChannelStorage,
	};
}
