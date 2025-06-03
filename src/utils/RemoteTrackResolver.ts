import { ObservedInboundTrack } from '../ObservedInboundTrack';
import { ObservedOutboundTrack } from '../ObservedOutboundTrack';

export interface RemoteTrackResolver {
	resolveRemoteOutboundTrack(
		inboundTrack: ObservedInboundTrack,
	): ObservedOutboundTrack | undefined;

	resolveRemoteInboundTracks(
		outboundTrack: ObservedOutboundTrack,
	): ObservedInboundTrack[] | undefined;
}