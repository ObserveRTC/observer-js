import { ObservedInboundAudioTrack } from './ObservedInboundAudioTrack';
import { ObservedInboundVideoTrack } from './ObservedInboundVideoTrack';
import { ObservedOutboundAudioTrack } from './ObservedOutboundAudioTrack';
import { ObservedOutboundVideoTrack } from './ObservedOutboundVideoTrack';

export class RemoteTrackAssigner {
	public readonly sfuStreamIdToOutboundVideoTracks = new Map<string, ObservedOutboundVideoTrack>();
	public readonly sfuStreamIdToOutboundAudioTracks = new Map<string, ObservedOutboundAudioTrack>();
	public readonly pendingInboundVideoTracks = new Map<string, ObservedInboundVideoTrack[]>();
	public readonly pendingInboundAudioTracks = new Map<string, ObservedInboundAudioTrack[]>();

	public addOutboundAudioTrack(track: ObservedOutboundAudioTrack) {
		const untilSfuStreamIdListener = () => {
			if (!track.sfuStreamId) return;

			this.sfuStreamIdToOutboundAudioTracks.set(track.sfuStreamId, track);
			track.off('update', untilSfuStreamIdListener);

			// we need to assign to the pending inbound tracks
		};

		track.on('update', untilSfuStreamIdListener);
		untilSfuStreamIdListener();
	}

	public addOutboundVideoTrack(track: ObservedOutboundVideoTrack) {
		const untilSfuStreamIdListener = () => {
			if (!track.sfuStreamId) return;

			this.sfuStreamIdToOutboundVideoTracks.set(track.sfuStreamId, track);
			track.off('update', untilSfuStreamIdListener);

			// we need to assign to the pending inbound tracks
		};

		track.on('update', untilSfuStreamIdListener);
		untilSfuStreamIdListener();
	}

	public addInboundAudioTrack(track: ObservedInboundAudioTrack) {
		const untilSfuStreamIdListener = () => {
			if (!track.sfuStreamId) return;
			const outboundTrack = this.sfuStreamIdToOutboundAudioTracks.get(track.sfuStreamId);
	
			if (!outboundTrack) {
				this.pendingInboundAudioTracks.set(
					track.sfuStreamId, 
					(this.pendingInboundAudioTracks.get(track.sfuStreamId) || []).concat(track)
				);

				return;
			}
			
			if (outboundTrack) {
				track.remoteOutboundTrack = outboundTrack;
			} else {
				this.pendingInboundAudioTracks.set(
					track.sfuStreamId, 
					(this.pendingInboundAudioTracks.get(track.sfuStreamId) || []).concat(track)
				);
			}
	
		};

		track.on('update', untilSfuStreamIdListener);
	}
	
}