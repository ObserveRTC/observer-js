import { ObservedCall } from './ObservedCall';
import { ObservedCertificate } from './webrtc/ObservedCertificate';
import { ObservedClient, ObservedClientEvents } from './ObservedClient';
import { ObservedCodec } from './webrtc/ObservedCodec';
import { ObservedDataChannel } from './webrtc/ObservedDataChannel';
import { ObservedIceCandidate } from './webrtc/ObservedIceCandidate';
import { ObservedIceCandidatePair } from './webrtc/ObservedIceCandidatePair';
import { ObservedIceTransport } from './webrtc/ObservedIceTransport';
import { ObservedInboundRtp } from './webrtc/ObservedInboundRtp';
import { ObservedInboundTrack } from './webrtc/ObservedInboundTrack';
import { ObservedMediaPlayout } from './webrtc/ObservedMediaPlayout';
import { ObservedMediaSource } from './webrtc/ObservedMediaSource';
import { ObservedOutboundRtp } from './webrtc/ObservedOutboundRtp';
import { ObservedOutboundTrack } from './webrtc/ObservedOutboundTrack';
import { ObservedPeerConnection } from './webrtc/ObservedPeerConnection';
import { Observer } from './Observer';
import { ClientEvent, ClientIssue, ClientMetaData, ClientSample, ExtensionStat } from './schema/ClientSample';

export class ObserverEventMonitor<Context> {
	public constructor(
		public readonly observer: Observer,
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
		this._onOutboundTrackMuted = this._onOutboundTrackMuted.bind(this);
		this._onOutboundTrackUnmuted = this._onOutboundTrackUnmuted.bind(this);
		this._onInboundRtpAdded = this._onInboundRtpAdded.bind(this);
		this._onInboundRtpRemoved = this._onInboundRtpRemoved.bind(this);
		this._onInboundRtpUpdated = this._onInboundRtpUpdated.bind(this);
		this._onOutboundTrackUpdated = this._onOutboundTrackUpdated.bind(this);
		this._onInboundTrackUpdated = this._onInboundTrackUpdated.bind(this);
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
		this._onClientIssue = this._onClientIssue.bind(this);
		this._onClientMetadata = this._onClientMetadata.bind(this);
		this._onClientJoined = this._onClientJoined.bind(this);
		this._onClientLeft = this._onClientLeft.bind(this);
		this._onUserMediaError = this._onUserMediaError.bind(this);
		this._onUsingTurn = this._onUsingTurn.bind(this);
		this._onClientAdded = this._onClientAdded.bind(this);
		this._onCallAdded = this._onCallAdded.bind(this);
		this._onClientRejoined = this._onClientRejoined.bind(this);
		this._onClientExtensionStats = this._onClientExtensionStats.bind(this);
		this._onCertificateUpdated = this._onCertificateUpdated.bind(this);
		this._onInboundRtpUpdated = this._onInboundRtpUpdated.bind(this);
		this._onOutboundRtpUpdated = this._onOutboundRtpUpdated.bind(this);
		this._onInboundTrackUpdated = this._onInboundTrackUpdated.bind(this);
		this._onOutboundTrackUpdated = this._onOutboundTrackUpdated.bind(this);
		this._onDataChannelUpdated = this._onDataChannelUpdated.bind(this);
		this._onIceTransportUpdated = this._onIceTransportUpdated.bind(this);
		this._onIceCandidatePairUpdated = this._onIceCandidatePairUpdated.bind(this);
		this._onMediaCodecUpdated = this._onMediaCodecUpdated.bind(this);
		this._onMediaPlayoutUpdated = this._onMediaPlayoutUpdated.bind(this);
		this._onMediaSourceUpdated = this._onMediaSourceUpdated.bind(this);
		this._onIceCandidateUpdated = this._onIceCandidateUpdated.bind(this);

		this.observer.once('close', () => {
			this.observer.off('newcall', this._onCallAdded);
		});
		this.observer.on('newcall', this._onCallAdded);
	}

	// Public event handlers
	public onCallAdded?: (call: ObservedCall, ctx: Context) => void;
	public onCallRemoved?: (call: ObservedCall, ctx: Context) => void;
	public onCallEmpty?: (call: ObservedCall, ctx: Context) => void;
	public onCallNotEmpty?: (call: ObservedCall, ctx: Context) => void;
	public onCallUpdated?: (call: ObservedCall, ctx: Context) => void;
	
	public onClientAdded?: (client: ObservedClient, ctx: Context) => void;
	public onClientClosed?: (client: ObservedClient, ctx: Context) => void;
	public onClientRejoined?: (client: ObservedClient, ctx: Context) => void;
	public onClientIssue?: (observedClent: ObservedClient, issue: ClientIssue, ctx: Context) => void;
	public onClientMetadata?: (observedClient: ObservedClient, metadata: ClientMetaData, ctx: Context) => void;
	public onClientExtensionStats?: (observedClient: ObservedClient, extensionStats: ExtensionStat, ctx: Context) => void;
	public onClientJoined?: (client: ObservedClient, ctx: Context) => void;
	public onClientLeft?: (client: ObservedClient, ctx: Context) => void;
	public onClientUserMediaError?: (observedClient: ObservedClient, error: string, ctx: Context) => void;
	public onClientUsingTurn?: (client: ObservedClient, usingTurn: boolean, ctx: Context) => void;
	public onClientUpdated?: (client: ObservedClient, sample: ClientSample, ctx: Context) => void;
	public onClientEvent?: (client: ObservedClient, event: ClientEvent, ctx: Context) => void;

	public onPeerConnectionAdded?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	public onPeerConnectionRemoved?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	public onSelectedCandidatePairChanged?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	public onIceGatheringStateChange?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	public onIceConnectionStateChange?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;
	public onConnectionStateChange?: (peerConnection: ObservedPeerConnection, ctx: Context) => void;

	public onCertificateAdded?: (certificate: ObservedCertificate, ctx: Context) => void;
	public onCertificateRemoved?: (certificate: ObservedCertificate, ctx: Context) => void;
	public onCertificateUpdated?: (certificate: ObservedCertificate, ctx: Context) => void;
	
	public onInboundTrackAdded?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	public onInboundTrackRemoved?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	public onInboundTrackUpdated?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	public onInboundTrackMuted?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	public onInboundTrackUnmuted?: (inboundTrack: ObservedInboundTrack, ctx: Context) => void;
	
	public onOutboundTrackAdded?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	public onOutboundTrackRemoved?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	public onOutboundTrackUpdated?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	public onOutboundTrackMuted?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	public onOutboundTrackUnmuted?: (outboundTrack: ObservedOutboundTrack, ctx: Context) => void;
	
	public onInboundRtpAdded?: (inboundRtp: ObservedInboundRtp, ctx: Context) => void;
	public onInboundRtpRemoved?: (inboundRtp: ObservedInboundRtp, ctx: Context) => void;
	public onInboundRtpUpdated?: (inboundRtp: ObservedInboundRtp, ctx: Context) => void;
	
	public onOutboundRtpAdded?: (outboundRtp: ObservedOutboundRtp, ctx: Context) => void;
	public onOutboundRtpRemoved?: (outboundRtp: ObservedOutboundRtp, ctx: Context) => void;
	public onOutboundRtpUpdated?: (outboundRtp: ObservedOutboundRtp, ctx: Context) => void;
	
	public onDataChannelAdded?: (dataChannel: ObservedDataChannel, ctx: Context) => void;
	public onDataChannelRemoved?: (dataChannel: ObservedDataChannel, ctx: Context) => void;
	public onDataChannelUpdated?: (dataChannel: ObservedDataChannel, ctx: Context) => void;
	
	public onAddedIceTransport?: (iceTransport: ObservedIceTransport, ctx: Context) => void;
	public onRemovedIceTransport?: (iceTransport: ObservedIceTransport, ctx: Context) => void;
	public onIceTransportUpdated?: (iceTransport: ObservedIceTransport, ctx: Context) => void;
	
	public onIceCandidateAdded?: (iceCandidate: ObservedIceCandidate, ctx: Context) => void;
	public onIceCandidateRemoved?: (iceCandidate: ObservedIceCandidate, ctx: Context) => void;
	public onIceCandidateUpdated?: (iceCandidate: ObservedIceCandidate, ctx: Context) => void;
	
	public onAddedIceCandidatePair?: (candidatePair: ObservedIceCandidatePair, ctx: Context) => void;
	public onRemovedIceCandidatePair?: (candidatePair: ObservedIceCandidatePair, ctx: Context) => void;
	public onIceCandidatePairUpdated?: (candidatePair: ObservedIceCandidatePair, ctx: Context) => void;
	
	public onAddedMediaCodec?: (codec: ObservedCodec, ctx: Context) => void;
	public onRemovedMediaCodec?: (codec: ObservedCodec, ctx: Context) => void;
	public onMediaCodecUpdated?: (codec: ObservedCodec, ctx: Context) => void;
	
	public onAddedMediaPlayout?: (mediaPlayout: ObservedMediaPlayout, ctx: Context) => void;
	public onRemovedMediaPlayout?: (mediaPlayout: ObservedMediaPlayout, ctx: Context) => void;
	public onMediaPlayoutUpdated?: (mediaPlayout: ObservedMediaPlayout, ctx: Context) => void;
	
	public onMediaSourceAdded?: (mediaSource: ObservedMediaSource, ctx: Context) => void;
	public onMediaSourceRemoved?: (mediaSource: ObservedMediaSource, ctx: Context) => void;
	public onMediaSourceUpdated?: (mediaSource: ObservedMediaSource, ctx: Context) => void;

	private _onCallAdded(call: ObservedCall) {
		const onCallEmpty = () => this.onCallEmpty?.(call, this.context);
		const onCallNotEmpty = () => this.onCallNotEmpty?.(call, this.context);
		const onCallUpdated = () => this.onCallUpdated?.(call, this.context);

		call.once('close', () => {
			call.off('newclient', this._onClientAdded);
			call.off('empty', onCallEmpty);
			call.off('not-empty', onCallNotEmpty);
			call.off('update', onCallUpdated);

			this.onCallRemoved?.(call, this.context);
		});
		call.on('newclient', this._onClientAdded);
		call.on('empty', onCallEmpty);
		call.on('not-empty', onCallNotEmpty);
		call.on('update', onCallUpdated);
		
		this.onCallAdded?.(call, this.context);
	}

	private _onClientAdded(observedClient: ObservedClient) {
		const onClientIssue = (issue: ClientIssue) => this._onClientIssue(observedClient, issue);
		const onClientMetadata = (metaData: ClientMetaData) => this._onClientMetadata(observedClient, metaData);
		const onClientJoined = () => this._onClientJoined(observedClient);
		const onClientLeft = () => this._onClientLeft(observedClient);
		const onClientRejoined = () => this._onClientRejoined(observedClient);
		const onClientExtensionStats = (extensionStats: ExtensionStat) => this._onClientExtensionStats(observedClient, extensionStats);
		const onUsingTurn = (usingTurn: boolean) => this._onUsingTurn(observedClient, usingTurn);
		const onUserMediaError = (error: string) => this._onUserMediaError(observedClient, error);
		const onClientUpdated = (...args: ObservedClientEvents['update']) => this.onClientUpdated?.(observedClient, args[0], this.context);
		const onClientEvent = (event: ClientEvent) => this.onClientEvent?.(observedClient, event, this.context);

		observedClient.once('close', () => {
			observedClient.off('newpeerconnection', this._onPeerConnconnectionAdded);
			observedClient.off('issue', onClientIssue);
			observedClient.off('metaData', onClientMetadata);
			observedClient.off('joined', onClientJoined);
			observedClient.off('left', onClientLeft);
			observedClient.off('rejoined', onClientJoined);
			observedClient.off('usermediaerror', onUserMediaError);
			observedClient.off('usingturn', onUsingTurn);
			observedClient.off('extensionStats', onClientExtensionStats);
			observedClient.off('update', onClientUpdated);
			observedClient.off('clientEvent', onClientEvent);
		
			this.onClientClosed?.(observedClient, this.context);
		});

		observedClient.on('newpeerconnection', this._onPeerConnconnectionAdded);
		observedClient.on('issue', onClientIssue);
		observedClient.on('metaData', onClientMetadata);
		observedClient.on('joined', onClientJoined);
		observedClient.on('left', onClientLeft);
		observedClient.on('rejoined', onClientRejoined);
		observedClient.on('usermediaerror', onUserMediaError);
		observedClient.on('usingturn', onUsingTurn);
		observedClient.on('extensionStats', onClientExtensionStats);
		observedClient.on('update', onClientUpdated);
		observedClient.on('clientEvent', onClientEvent);

		this.onClientAdded?.(observedClient, this.context);
	}

	private _onClientRejoined(observedClient: ObservedClient) {
		this.onClientRejoined?.(observedClient, this.context);
	}

	private _onPeerConnconnectionAdded(peerConnection: ObservedPeerConnection) {
		const onSelectedCandidatePairChanged = () => this.onSelectedCandidatePairChanged?.(peerConnection, this.context);
		const onIceGatheringStateChange = () => this.onIceGatheringStateChange?.(peerConnection, this.context);
		const onIceConnectionStateChange = () => this.onIceConnectionStateChange?.(peerConnection, this.context);
		const onConnectionStateChange = () => this.onConnectionStateChange?.(peerConnection, this.context);

		peerConnection.once('close', () => {
			peerConnection.off('added-certificate', this._onCertificateAdded);
			peerConnection.off('removed-certificate', this._onCertificateRemoved);
			peerConnection.off('updated-certificate', this._onCertificateUpdated);

			peerConnection.off('added-inbound-track', this._onInboundTrackAdded);
			peerConnection.off('removed-inbound-track', this._onInboundTrackRemoved);
			peerConnection.off('updated-inbound-track', this._onInboundTrackUpdated);
			peerConnection.off('muted-inbound-track', this._onInboundTrackMuted);
			peerConnection.off('unmuted-inbound-track', this._onInboundTrackUnmuted);

			peerConnection.off('added-outbound-track', this._onOutboundTrackAdded);
			peerConnection.off('removed-outbound-track', this._onOutboundTrackRemoved);
			peerConnection.off('updated-outbound-track', this._onOutboundTrackUpdated);
			peerConnection.off('muted-outbound-track', this._onOutboundTrackMuted);
			peerConnection.off('unmuted-outbound-track', this._onOutboundTrackUnmuted);

			peerConnection.off('added-inbound-rtp', this._onInboundRtpAdded);
			peerConnection.off('removed-inbound-rtp', this._onInboundRtpRemoved);
			peerConnection.off('updated-inbound-rtp', this._onInboundRtpUpdated);

			peerConnection.off('added-outbound-rtp', this._onOutboundRtpAdded);
			peerConnection.off('removed-outbound-rtp', this._onOutboundRtpRemoved);
			peerConnection.off('updated-outbound-rtp', this._onOutboundRtpUpdated);

			peerConnection.off('added-data-channel', this._onDataChannelAdded);
			peerConnection.off('removed-data-channel', this._onDataChannelRemoved);
			peerConnection.off('updated-data-channel', this._onDataChannelUpdated);

			peerConnection.off('added-ice-transport', this._onAddedIceTransport);
			peerConnection.off('removed-ice-transport', this._onRemovedIceTransport);
			peerConnection.off('updated-ice-transport', this._onIceTransportUpdated);

			peerConnection.off('added-ice-candidate', this._onIceCandidateAdded);
			peerConnection.off('removed-ice-candidate', this._onIceCandidateRemoved);
			peerConnection.off('updated-ice-candidate', this._onIceCandidateUpdated);

			peerConnection.off('added-ice-candidate-pair', this._onAddedIceCandidatePair);
			peerConnection.off('removed-ice-candidate-pair', this._onRemovedIceCandidatePair);
			peerConnection.off('updated-ice-candidate-pair', this._onIceCandidatePairUpdated);

			peerConnection.off('added-codec', this._onAddedMediaCodec);
			peerConnection.off('removed-codec', this._onRemovedMediaCodec);
			peerConnection.off('updated-codec', this._onMediaCodecUpdated);

			peerConnection.off('added-media-playout', this._onAddedMediaPlayout);
			peerConnection.off('removed-media-playout', this._onRemovedMediaPlayout);
			peerConnection.off('updated-media-playout', this._onMediaPlayoutUpdated);

			peerConnection.off('added-media-source', this._onMediaSourceAdded);
			peerConnection.off('removed-media-source', this._onMediaSourceRemoved);
			peerConnection.off('updated-media-source', this._onMediaSourceUpdated);

			peerConnection.off('selectedcandidatepair', onSelectedCandidatePairChanged);
			peerConnection.off('icegatheringstatechange', onIceGatheringStateChange);
			peerConnection.off('iceconnectionstatechange', onIceConnectionStateChange);
			peerConnection.off('connectionstatechange', onConnectionStateChange);

			this.onPeerConnectionRemoved?.(peerConnection, this.context);
		});
        
		peerConnection.on('added-certificate', this._onCertificateAdded);
		peerConnection.on('removed-certificate', this._onCertificateRemoved);
		peerConnection.on('updated-certificate', this._onCertificateUpdated);

		peerConnection.on('added-inbound-track', this._onInboundTrackAdded);
		peerConnection.on('removed-inbound-track', this._onInboundTrackRemoved);
		peerConnection.on('updated-inbound-track', this._onInboundTrackUpdated);
		peerConnection.on('muted-inbound-track', this._onInboundTrackMuted);
		peerConnection.on('unmuted-inbound-track', this._onInboundTrackUnmuted);

		peerConnection.on('added-outbound-track', this._onOutboundTrackAdded);
		peerConnection.on('removed-outbound-track', this._onOutboundTrackRemoved);
		peerConnection.on('updated-outbound-track', this._onOutboundTrackUpdated);
		peerConnection.on('muted-outbound-track', this._onOutboundTrackMuted);
		peerConnection.on('unmuted-outbound-track', this._onOutboundTrackUnmuted);

		peerConnection.on('added-inbound-rtp', this._onInboundRtpAdded);
		peerConnection.on('removed-inbound-rtp', this._onInboundRtpRemoved);
		peerConnection.on('updated-inbound-rtp', this._onInboundRtpUpdated);

		peerConnection.on('added-outbound-rtp', this._onOutboundRtpAdded);
		peerConnection.on('removed-outbound-rtp', this._onOutboundRtpRemoved);
		peerConnection.on('updated-outbound-rtp', this._onOutboundRtpUpdated);

		peerConnection.on('added-data-channel', this._onDataChannelAdded);
		peerConnection.on('removed-data-channel', this._onDataChannelRemoved);
		peerConnection.on('updated-data-channel', this._onDataChannelUpdated);

		peerConnection.on('added-ice-transport', this._onAddedIceTransport);
		peerConnection.on('removed-ice-transport', this._onRemovedIceTransport);
		peerConnection.on('updated-ice-transport', this._onIceTransportUpdated);

		peerConnection.on('added-ice-candidate', this._onIceCandidateAdded);
		peerConnection.on('removed-ice-candidate', this._onIceCandidateRemoved);
		peerConnection.on('updated-ice-candidate', this._onIceCandidateUpdated);

		peerConnection.on('added-ice-candidate-pair', this._onAddedIceCandidatePair);
		peerConnection.on('removed-ice-candidate-pair', this._onRemovedIceCandidatePair);
		peerConnection.on('updated-ice-candidate-pair', this._onIceCandidatePairUpdated);

		peerConnection.on('added-codec', this._onAddedMediaCodec);
		peerConnection.on('removed-codec', this._onRemovedMediaCodec);
		peerConnection.on('updated-codec', this._onMediaCodecUpdated);

		peerConnection.on('added-media-playout', this._onAddedMediaPlayout);
		peerConnection.on('removed-media-playout', this._onRemovedMediaPlayout);
		peerConnection.on('updated-media-playout', this._onMediaPlayoutUpdated);

		peerConnection.on('added-media-source', this._onMediaSourceAdded);
		peerConnection.on('removed-media-source', this._onMediaSourceRemoved);
		peerConnection.on('updated-media-source', this._onMediaSourceUpdated);
		
		peerConnection.on('selectedcandidatepair', onSelectedCandidatePairChanged);
		peerConnection.on('icegatheringstatechange', onIceGatheringStateChange);
		peerConnection.on('iceconnectionstatechange', onIceConnectionStateChange);
		peerConnection.on('connectionstatechange', onConnectionStateChange);

		this.onPeerConnectionAdded?.(peerConnection, this.context);

	}
	
	private _onPeerConnectionRemoved(peerConnection: ObservedPeerConnection) {
		this.onPeerConnectionRemoved?.(peerConnection, this.context);

	}
    
	private _onCertificateAdded(certificate: ObservedCertificate) {
		this.onCertificateAdded?.(certificate, this.context);
	}

	private _onCertificateRemoved(certificate: ObservedCertificate) {
		this.onCertificateRemoved?.(certificate, this.context);
	}

	private _onCertificateUpdated(certificate: ObservedCertificate) {
		this.onCertificateUpdated?.(certificate, this.context);
	}

	private _onInboundTrackAdded(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackAdded?.(inboundTrack, this.context);
	}

	private _onInboundTrackRemoved(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackRemoved?.(inboundTrack, this.context);
	}

	private _onInboundTrackUpdated(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackUpdated?.(inboundTrack, this.context);
	}

	private _onOutboundTrackMuted(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackMuted?.(outboundTrack, this.context);
	}

	private _onOutboundTrackUnmuted(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackUnmuted?.(outboundTrack, this.context);
	}

	private _onOutboundTrackAdded(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackAdded?.(outboundTrack, this.context);
	}

	private _onOutboundTrackRemoved(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackRemoved?.(outboundTrack, this.context);
	}

	private _onOutboundTrackUpdated(outboundTrack: ObservedOutboundTrack) {
		this.onOutboundTrackUpdated?.(outboundTrack, this.context);
	}

	private _onInboundTrackMuted(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackMuted?.(inboundTrack, this.context);
	}

	private _onInboundTrackUnmuted(inboundTrack: ObservedInboundTrack) {
		this.onInboundTrackUnmuted?.(inboundTrack, this.context);
	}

	private _onInboundRtpAdded(inboundRtp: ObservedInboundRtp) {
		this.onInboundRtpAdded?.(inboundRtp, this.context);
	}

	private _onInboundRtpRemoved(inboundRtp: ObservedInboundRtp) {
		this.onInboundRtpRemoved?.(inboundRtp, this.context);
	}

	private _onInboundRtpUpdated(inboundRtp: ObservedInboundRtp) {
		this.onInboundRtpUpdated?.(inboundRtp, this.context);
	}

	private _onOutboundRtpAdded(outboundRtp: ObservedOutboundRtp) {
		this.onOutboundRtpAdded?.(outboundRtp, this.context);
	}

	private _onOutboundRtpRemoved(outboundRtp: ObservedOutboundRtp) {
		this.onOutboundRtpRemoved?.(outboundRtp, this.context);
	}

	private _onOutboundRtpUpdated(outboundRtp: ObservedOutboundRtp) {
		this.onOutboundRtpUpdated?.(outboundRtp, this.context);
	}

	private _onDataChannelAdded(dataChannel: ObservedDataChannel) {
		this.onDataChannelAdded?.(dataChannel, this.context);
	}

	private _onDataChannelRemoved(dataChannel: ObservedDataChannel) {
		this.onDataChannelRemoved?.(dataChannel, this.context);
	}

	private _onDataChannelUpdated(dataChannel: ObservedDataChannel) {
		this.onDataChannelUpdated?.(dataChannel, this.context);
	}

	private _onAddedIceTransport(iceTransport: ObservedIceTransport) {
		this.onAddedIceTransport?.(iceTransport, this.context);
	}

	private _onRemovedIceTransport(iceTransport: ObservedIceTransport) {
		this.onRemovedIceTransport?.(iceTransport, this.context);
	}

	private _onIceTransportUpdated(iceTransport: ObservedIceTransport) {
		this.onIceTransportUpdated?.(iceTransport, this.context);
	}

	private _onIceCandidateAdded(iceCandidate: ObservedIceCandidate) {
		this.onIceCandidateAdded?.(iceCandidate, this.context);
	}

	private _onIceCandidateRemoved(iceCandidate: ObservedIceCandidate) {
		this.onIceCandidateRemoved?.(iceCandidate, this.context);
	}

	private _onIceCandidateUpdated(iceCandidate: ObservedIceCandidate) {
		this.onIceCandidateUpdated?.(iceCandidate, this.context);
	}

	private _onAddedIceCandidatePair(candidatePair: ObservedIceCandidatePair) {
		this.onAddedIceCandidatePair?.(candidatePair, this.context);
	}

	private _onRemovedIceCandidatePair(candidatePair: ObservedIceCandidatePair) {
		this.onRemovedIceCandidatePair?.(candidatePair, this.context);
	}

	private _onIceCandidatePairUpdated(candidatePair: ObservedIceCandidatePair) {
		this.onIceCandidatePairUpdated?.(candidatePair, this.context);
	}

	private _onAddedMediaCodec(codec: ObservedCodec) {
		this.onAddedMediaCodec?.(codec, this.context);
	}

	private _onRemovedMediaCodec(codec: ObservedCodec) {
		this.onRemovedMediaCodec?.(codec, this.context);
	}

	private _onMediaCodecUpdated(codec: ObservedCodec) {
		this.onMediaCodecUpdated?.(codec, this.context);
	}

	private _onAddedMediaPlayout(mediaPlayout: ObservedMediaPlayout) {
		this.onAddedMediaPlayout?.(mediaPlayout, this.context);
	}

	private _onRemovedMediaPlayout(mediaPlayout: ObservedMediaPlayout) {
		this.onRemovedMediaPlayout?.(mediaPlayout, this.context);
	}

	private _onMediaPlayoutUpdated(mediaPlayout: ObservedMediaPlayout) {
		this.onMediaPlayoutUpdated?.(mediaPlayout, this.context);
	}

	private _onMediaSourceAdded(mediaSource: ObservedMediaSource) {
		this.onMediaSourceAdded?.(mediaSource, this.context);
	}
	
	private _onMediaSourceRemoved(mediaSource: ObservedMediaSource) {
		this.onMediaSourceRemoved?.(mediaSource, this.context);
	}

	private _onMediaSourceUpdated(mediaSource: ObservedMediaSource) {
		this.onMediaSourceUpdated?.(mediaSource, this.context);
	}

	private _onClientIssue(observedClent: ObservedClient, issue: ClientIssue) {
		this.onClientIssue?.(observedClent, issue, this.context);
	}

	private _onClientMetadata(observedClient: ObservedClient, metadata: ClientMetaData) {
		this.onClientMetadata?.(observedClient, metadata, this.context);
	}

	private _onClientExtensionStats(observedClient: ObservedClient, extensionStats: ExtensionStat) {
		this.onClientExtensionStats?.(observedClient, extensionStats, this.context);
	}

	private _onClientJoined(observedClient: ObservedClient) {
		this.onClientJoined?.(observedClient, this.context);
	}

	private _onClientLeft(observedClient: ObservedClient) {
		this.onClientLeft?.(observedClient, this.context);
	}

	private _onUserMediaError(observedClient: ObservedClient, error: string) {
		this.onClientUserMediaError?.(observedClient, error, this.context);
	}

	private _onUsingTurn(observedClient: ObservedClient, usingTurn: boolean) {
		this.onClientUsingTurn?.(observedClient, usingTurn, this.context);
	}
}