import { ObservedCall } from '../ObservedCall';
import { RemoteTrackResolver, RemoteTrackResolverFactory } from './RemoteTrackResolver';

export function createDefaultMediasoupRemoteTrackResolverFactory(): RemoteTrackResolverFactory {
	return (observedCall: ObservedCall) => new RemoteTrackResolver(observedCall, {
		resolveInboundTrackPublisherId: (inboundTrack) => inboundTrack.attachments?.producerId as string | undefined,
		resolveInboundTrackSubscriberId: (inboundTrack) => inboundTrack.attachments?.consumerId as string | undefined,
		resolveOutboundTrackPublisherId: (outboundTrack) => outboundTrack.attachments?.producerId as string | undefined,
	});
}

export function createP2pRemoteTrackResolverFactory(): RemoteTrackResolverFactory {
	return (observedCall: ObservedCall) => new RemoteTrackResolver(observedCall, {
		resolveInboundTrackPublisherId: (inboundTrack) => {
			const ssrc = inboundTrack.getInboundRtp()?.ssrc;

			return ssrc ? `${ssrc}` : undefined;
		},
		resolveInboundTrackSubscriberId: (inboundTrack) => {
			const ssrc = inboundTrack.getInboundRtp()?.ssrc;

			return ssrc ? `${ssrc}` : undefined;
		},
		resolveOutboundTrackPublisherId: (outboundTrack) => {
			// In p2p the sender's SSRC is preserved end-to-end, so it matches the receiver's
			// inbound SSRC. (Single-encoding case; simulcast would need per-encoding keys.)
			const rtps = outboundTrack.getOutboundRtps();

			if (!rtps || rtps.length === 0) return undefined;

			return rtps.map((rtp) => rtp.ssrc).join(',');
		}
	});
}
