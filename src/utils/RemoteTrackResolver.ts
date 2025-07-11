import { ObservedInboundTrack } from '../webrtc/ObservedInboundTrack';
import { ObservedOutboundTrack } from '../webrtc/ObservedOutboundTrack';

export interface RemoteTrackResolver {
	resolveRemoteOutboundTrack(
		inboundTrack: ObservedInboundTrack,
	): ObservedOutboundTrack | undefined;

	resolveRemoteInboundTracks(
		outboundTrack: ObservedOutboundTrack,
	): ObservedInboundTrack[] | undefined;
}