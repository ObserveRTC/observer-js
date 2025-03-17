import { ObservedCertificate } from './ObservedCertificate';
import { ObservedClient } from './ObservedClient';
import { ObservedCodec } from './ObservedCodec';
import { ObservedDataChannel } from './ObservedDataChannel';
import { ObservedIceCandidate } from './ObservedIceCandidate';
import { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
import { ObservedIceTransport } from './ObservedIceTransport';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';
import { ObservedMediaSource } from './ObservedMediaSource';
import { ObservedOutboundRtp } from './ObservedOutboundRtp';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ClientIssue, ClientMetaData, ExtensionStat } from './schema/ClientSample';

export class ObservedClientEventMonitor<Context> {
	public constructor(
		public readonly observedClient: ObservedClient,
		public readonly context: Context,
	) {
		this._onPeerConnconnectionAdded = this._onPeerConnconnectionAdded.bind(this);
		this._onPeerConnectionRemoved = this._onPeerConnectionRemoved.bind(this);
		this._onCertificateAdded = this._onCertificateAdded.bind(this);
		this._onCertificateRemoved = this._onCertificateRemoved.bind(this);
		this._onInboundTrackAdded = this._onInboundTrackAdded.bind(this);
		this._onInboundTrackRemoved = this._onInboundTrackRemoved.bind(this);
		this._onOutboundTrackAdded = this._onOutboundTrackAdded.bind(this);
		this._onOutboundTrackRemoved = this._onOutboundTrackRemoved.bind(this);
		this._onInboundRtpAdded = this._onInboundRtpAdded.bind(this);
		this._onInboundRtpRemoved = this._onInboundRtpRemoved.bind(this);
		this._onOutboundRtpAdded = this._onOutboundRtpAdded.bind(this);
		this._onOutboundRtpRemoved = this._onOutboundRtpRemoved.bind(this);
		this._onDataChannelAdded = this._onDataChannelAdded.bind(this);
		this._onDataChannelRemoved = this._onDataChannelRemoved.bind(this);
		this._onAddedIceTransport = this._onAddedIceTransport.bind(this);
		this._onRemovedIceTransport = this._onRemovedIceTransport.bind(this);
		this._onIceCandidateAdded = this._onIceCandidateAdded.bind(this);
		this._onIceCandidateRemoved = this._onIceCandidateRemoved.bind(this);
		this._onAddedIceCandidatePair = this._onAddedIceCandidatePair.bind(this);
		this._onRemovedIceCandidatePair = this._onRemovedIceCandidatePair.bind(this);
		this._onAddedMediaCodec = this._onAddedMediaCodec.bind(this);
		this._onRemovedMediaCodec = this._onRemovedMediaCodec.bind(this);
		this._onAddedMediaPlayout = this._onAddedMediaPlayout.bind(this);
		this._onRemovedMediaPlayout = this._onRemovedMediaPlayout.bind(this);
		this._onMediaSourceAdded = this._onMediaSourceAdded.bind(this);
		this._onMediaSourceRemoved = this._onMediaSourceRemoved.bind(this);
		this._onClientClosed = this._onClientClosed.bind(this);
		this._onClientIssue = this._onClientIssue.bind(this);
		this._onClientMetadata = this._onClientMetadata.bind(this);
		this._onClientJoined = this._onClientJoined.bind(this);
		this._onClientLeft = this._onClientLeft.bind(this);
		this._onUserMediaError = this._onUserMediaError.bind(this);
		this._onUsingTurn = this._onUsingTurn.bind(this);

		this.observedClient.on('newpeerconnection', this._onPeerConnconnectionAdded);
		this.observedClient.on('issue', this._onClientIssue);
		this.observedClient.on('metaData', this._onClientMetadata);
		this.observedClient.on('joined', this._onClientJoined);
		this.observedClient.on('left', this._onClientLeft);
		this.observedClient.on('rejoined', this._onClientJoined);
		this.observedClient.on('usermediaerror', this._onUserMediaError);
		this.observedClient.on('usingturn', this._onUsingTurn);
		
		this.observedClient.once('close', this._onClientClosed);
	}

	public onClientClosed?: (client: ObservedClient, ctx: Context) => void;
	private _onClientClosed() {
		this.onClientClosed?.(this.observedClient, this.context);

		this.observedClient.off('newpeerconnection', this._onPeerConnconnectionAdded);
		this.observedClient.off('issue', this._onClientIssue);
		this.observedClient.off('metaData', this._onClientMetadata);
		this.observedClient.off('joined', this._onClientJoined);
		this.observedClient.off('left', this._onClientLeft);
		this.observedClient.off('rejoined', this._onClientJoined);
		this.observedClient.off('usermediaerror', this._onUserMediaError);
		this.observedClient.off('usingturn', this._onUsingTurn);

	}

	public onPeerConnectionAdded?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	private _onPeerConnconnectionAdded(peerConnection: ObservedPeerConnection) {
		this.onPeerConnectionAdded?.(peerConnection, this.context);

		peerConnection.once('close', () => this._onPeerConnectionRemoved(peerConnection));
        
		peerConnection.on('added-certificate', this._onCertificateAdded);
		peerConnection.on('removed-certificate', this._onCertificateRemoved);
		peerConnection.on('added-inbound-track', this._onInboundTrackAdded);
		peerConnection.on('removed-inbound-track', this._onInboundTrackRemoved);
		peerConnection.on('added-outbound-track', this._onOutboundTrackAdded);
		peerConnection.on('removed-outbound-track', this._onOutboundTrackRemoved);
		peerConnection.on('added-inbound-rtp', this._onInboundRtpAdded);
		peerConnection.on('removed-inbound-rtp', this._onInboundRtpRemoved);
		peerConnection.on('added-outbound-rtp', this._onOutboundRtpAdded);
		peerConnection.on('removed-outbound-rtp', this._onOutboundRtpRemoved);
		peerConnection.on('added-data-channel', this._onDataChannelAdded);
		peerConnection.on('removed-data-channel', this._onDataChannelRemoved);
		peerConnection.on('added-ice-transport', this._onAddedIceTransport);
		peerConnection.on('removed-ice-transport', this._onRemovedIceTransport);
		peerConnection.on('added-ice-candidate', this._onIceCandidateAdded);
		peerConnection.on('removed-ice-candidate', this._onIceCandidateRemoved);
		peerConnection.on('added-ice-candidate-pair', this._onAddedIceCandidatePair);
		peerConnection.on('removed-ice-candidate-pair', this._onRemovedIceCandidatePair);
		peerConnection.on('added-codec', this._onAddedMediaCodec);
		peerConnection.on('removed-codec', this._onRemovedMediaCodec);
		peerConnection.on('added-media-playout', this._onAddedMediaPlayout);
		peerConnection.on('removed-media-playout', this._onRemovedMediaPlayout);
		peerConnection.on('added-media-source', this._onMediaSourceAdded);
		peerConnection.on('removed-media-source', this._onMediaSourceRemoved);

	}

	public onPeerConnectionRemoved?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	private _onPeerConnectionRemoved(peerConnection: ObservedPeerConnection) {
		this.onPeerConnectionRemoved?.(peerConnection, this.context);

		peerConnection.off('added-certificate', this._onCertificateAdded);
		peerConnection.off('removed-certificate', this._onCertificateRemoved);
		peerConnection.off('added-inbound-track', this._onInboundTrackAdded);
		peerConnection.off('removed-inbound-track', this._onInboundTrackRemoved);
		peerConnection.off('added-outbound-track', this._onOutboundTrackAdded);
		peerConnection.off('removed-outbound-track', this._onOutboundTrackRemoved);
		peerConnection.off('added-inbound-rtp', this._onInboundRtpAdded);
		peerConnection.off('removed-inbound-rtp', this._onInboundRtpRemoved);
		peerConnection.off('added-outbound-rtp', this._onOutboundRtpAdded);
		peerConnection.off('removed-outbound-rtp', this._onOutboundRtpRemoved);
		peerConnection.off('added-data-channel', this._onDataChannelAdded);
		peerConnection.off('removed-data-channel', this._onDataChannelRemoved);
		peerConnection.off('added-ice-transport', this._onAddedIceTransport);
		peerConnection.off('removed-ice-transport', this._onRemovedIceTransport);
		peerConnection.off('added-ice-candidate', this._onIceCandidateAdded);
		peerConnection.off('removed-ice-candidate', this._onIceCandidateRemoved);
		peerConnection.off('added-ice-candidate-pair', this._onAddedIceCandidatePair);
		peerConnection.off('removed-ice-candidate-pair', this._onRemovedIceCandidatePair);
		peerConnection.off('added-codec', this._onAddedMediaCodec);
		peerConnection.off('removed-codec', this._onRemovedMediaCodec);
		peerConnection.off('added-media-playout', this._onAddedMediaPlayout);
		peerConnection.off('removed-media-playout', this._onRemovedMediaPlayout);
		peerConnection.off('added-media-source', this._onMediaSourceAdded);
		peerConnection.off('removed-media-source', this._onMediaSourceRemoved);

	}
    
	public onCertificateAdded?: (certificate: ObservedCertificate, ctx: Context) => void;
	private _onCertificateAdded(certificate: ObservedCertificate) {
		this.onCertificateAdded?.(certificate, this.context);
	}

	public onCertificateRemoved?: (certificate: ObservedCertificate, ctx: Context) => void;
	private _onCertificateRemoved(certificate: ObservedCertificate) {
		this.onCertificateRemoved?.(certificate, this.context);
	}

	public onInboundTrackAdded?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	private _onInboundTrackAdded(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackAdded?.(inboundTrack, this.context);
	}

	public onInboundTrackRemoved?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	private _onInboundTrackRemoved(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackRemoved?.(inboundTrack, this.context);
	}

	public onOutboundTrackAdded?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	private _onOutboundTrackAdded(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackAdded?.(outboundTrack, this.context);
	}

	public onOutboundTrackRemoved?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	private _onOutboundTrackRemoved(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackRemoved?.(outboundTrack, this.context);
	}

	public onInboundRtpAdded?: (inboundRtp: ObservedInboundRtp, ctx: Context) => void;
	private _onInboundRtpAdded(inboundRtp: ObservedInboundRtp) {
		this.onInboundRtpAdded?.(inboundRtp, this.context);
	}

	public onInboundRtpRemoved?: (inboundRtp: ObservedInboundRtp, ctx: Context) => void;
	private _onInboundRtpRemoved(inboundRtp: ObservedInboundRtp) {
		this.onInboundRtpRemoved?.(inboundRtp, this.context);
	}

	public onOutboundRtpAdded?: (outboundRtp: ObservedOutboundRtp, ctx: Context) => void;
	private _onOutboundRtpAdded(outboundRtp: ObservedOutboundRtp) {
		this.onOutboundRtpAdded?.(outboundRtp, this.context);
	}

	public onOutboundRtpRemoved?: (outboundRtp: ObservedOutboundRtp, ctx: Context) => void;
	private _onOutboundRtpRemoved(outboundRtp: ObservedOutboundRtp) {
		this.onOutboundRtpRemoved?.(outboundRtp, this.context);
	}

	public onDataChannelAdded?: (dataChannel: ObservedDataChannel, ctx: Context) => void;
	private _onDataChannelAdded(dataChannel: ObservedDataChannel) {
		this.onDataChannelAdded?.(dataChannel, this.context);
	}

	public onDataChannelRemoved?: (dataChannel: ObservedDataChannel, ctx: Context) => void;
	private _onDataChannelRemoved(dataChannel: ObservedDataChannel) {
		this.onDataChannelRemoved?.(dataChannel, this.context);
	}

	public onAddedIceTransport?: (iceTransport: ObservedIceTransport, ctx: Context) => void;
	private _onAddedIceTransport(iceTransport: ObservedIceTransport) {
		this.onAddedIceTransport?.(iceTransport, this.context);
	}

	public onRemovedIceTransport?: (iceTransport: ObservedIceTransport, ctx: Context) => void;
	private _onRemovedIceTransport(iceTransport: ObservedIceTransport) {
		this.onRemovedIceTransport?.(iceTransport, this.context);
	}

	public onIceCandidateAdded?: (iceCandidate: ObservedIceCandidate, ctx: Context) => void;
	private _onIceCandidateAdded(iceCandidate: ObservedIceCandidate) {
		this.onIceCandidateAdded?.(iceCandidate, this.context);
	}

	public onIceCandidateRemoved?: (iceCandidate: ObservedIceCandidate, ctx: Context) => void;
	private _onIceCandidateRemoved(iceCandidate: ObservedIceCandidate) {
		this.onIceCandidateRemoved?.(iceCandidate, this.context);
	}

	public onAddedIceCandidatePair?: (candidatePair: ObservedIceCandidatePair, ctx: Context) => void;
	private _onAddedIceCandidatePair(candidatePair: ObservedIceCandidatePair) {
		this.onAddedIceCandidatePair?.(candidatePair, this.context);
	}

	public onRemovedIceCandidatePair?: (candidatePair: ObservedIceCandidatePair, ctx: Context) => void;
	private _onRemovedIceCandidatePair(candidatePair: ObservedIceCandidatePair) {
		this.onRemovedIceCandidatePair?.(candidatePair, this.context);
	}

	public onAddedMediaCodec?: (codec: ObservedCodec, ctx: Context) => void;
	private _onAddedMediaCodec(codec: ObservedCodec) {
		this.onAddedMediaCodec?.(codec, this.context);
	}

	public onRemovedMediaCodec?: (codec: ObservedCodec, ctx: Context) => void;
	private _onRemovedMediaCodec(codec: ObservedCodec) {
		this.onRemovedMediaCodec?.(codec, this.context);
	}

	public onAddedMediaPlayout?: (mediaPlayout: ObservedMediaPlayout, ctx: Context) => void;
	private _onAddedMediaPlayout(mediaPlayout: ObservedMediaPlayout) {
		this.onAddedMediaPlayout?.(mediaPlayout, this.context);
	}

	public onRemovedMediaPlayout?: (mediaPlayout: ObservedMediaPlayout, ctx: Context) => void;
	private _onRemovedMediaPlayout(mediaPlayout: ObservedMediaPlayout) {
		this.onRemovedMediaPlayout?.(mediaPlayout, this.context);
	}

	public onMediaSourceAdded?: (mediaSource: ObservedMediaSource, ctx: Context) => void;
	private _onMediaSourceAdded(mediaSource: ObservedMediaSource) {
		this.onMediaSourceAdded?.(mediaSource, this.context);
	}

	public onMediaSourceRemoved?: (mediaSource: ObservedMediaSource, ctx: Context) => void;
	private _onMediaSourceRemoved(mediaSource: ObservedMediaSource) {
		this.onMediaSourceRemoved?.(mediaSource, this.context);
	}

	public onClientIssue?: (issue: ClientIssue, ctx: Context) => void;
	private _onClientIssue(issue: ClientIssue) {
		this.onClientIssue?.(issue, this.context);
	}

	public onClientMetadata?: (metadata: ClientMetaData, ctx: Context) => void;
	private _onClientMetadata(metadata: ClientMetaData) {
		this.onClientMetadata?.(metadata, this.context);
	}

	public onClientExtensionStats?: (extensionStats: ExtensionStat, ctx: Context) => void;
	private _onClientExtensionStats(extensionStats: ExtensionStat) {
		this.onClientExtensionStats?.(extensionStats, this.context);
	}

	public onClientJoined?: (client: ObservedClient, ctx: Context) => void;
	private _onClientJoined() {
		this.onClientJoined?.(this.observedClient, this.context);
	}

	public onClientLeft?: (client: ObservedClient, ctx: Context) => void;
	private _onClientLeft() {
		this.onClientLeft?.(this.observedClient, this.context);
	}

	public onUserMediaError?: (error: string, observedClient: ObservedClient, ctx: Context) => void;
	private _onUserMediaError(error: string) {
		this.onUserMediaError?.(error, this.observedClient, this.context);
	}

	public onUsingTurn?: (client: ObservedClient, ctx: Context) => void;
	private _onUsingTurn() {
		this.onUsingTurn?.(this.observedClient, this.context);
	}
}