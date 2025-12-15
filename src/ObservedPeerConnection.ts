import { EventEmitter } from 'events';
import { ObservedClient } from './ObservedClient';
import { CertificateStats, CodecStats, DataChannelStats, IceCandidateStats, InboundRtpStats, InboundTrackSample, MediaPlayoutStats, MediaSourceStats, OutboundRtpStats, OutboundTrackSample, PeerConnectionSample, PeerConnectionTransportStats, RemoteInboundRtpStats, RemoteOutboundRtpStats } from './schema/ClientSample';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { createLogger } from './common/logger';
import { MediaKind } from './common/types';
import { ObservedOutboundRtp } from './ObservedOutboundRtp';
import { ObservedCertificate } from './ObservedCertificate';
import { ObservedCodec } from './ObservedCodec';
import { ObservedDataChannel } from './ObservedDataChannel';
import { ObservedIceCandidate } from './ObservedIceCandidate';
import { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
import { ObservedIceTransport } from './ObservedIceTransport';
import { ObservedMediaSource } from './ObservedMediaSource';
import { ObservedPeerConnectionTransport } from './ObservedPeerConnectionTransport';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';
import { ObservedRemoteInboundRtp } from './ObservedRemoteInboundRtp';
import { ObservedRemoteOutboundRtp } from './ObservedRemoteOutboundRtp';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { CalculatedScore } from './scores/CalculatedScore';
import { ObservedTurnServer } from './ObservedTurnServer';
import { getMedian } from './common/utils';

const logger = createLogger('ObservedPeerConnection');

export type ObservedPeerConnectionEvents = {
	iceconnectionstatechange: [
		{
			state: string;
		}
	];
	icegatheringstatechange: [
		{
			state: string;
		}
	];
	connectionstatechange: [
		{
			state: string;
		}
	];
	selectedcandidatepair: [];

	'added-certificate': [ObservedCertificate];
	'added-codec': [ObservedCodec];
	'added-data-channel': [ObservedDataChannel];
	'added-ice-candidate': [ObservedIceCandidate];
	'added-ice-candidate-pair': [ObservedIceCandidatePair];
	'added-ice-transport': [ObservedIceTransport];
	'added-inbound-rtp': [ObservedInboundRtp];
	'added-inbound-track': [ObservedInboundTrack];
	'added-media-playout': [ObservedMediaPlayout];
	'added-media-source': [ObservedMediaSource];
	'added-outbound-rtp': [ObservedOutboundRtp];
	'added-outbound-track': [ObservedOutboundTrack];
	'added-peer-connection-transport': [ObservedPeerConnectionTransport];
	'added-remote-inbound-rtp': [ObservedRemoteInboundRtp];
	'added-remote-outbound-rtp': [ObservedRemoteOutboundRtp];
	'removed-certificate': [ObservedCertificate];
	'removed-codec': [ObservedCodec];
	'removed-data-channel': [ObservedDataChannel];
	'removed-ice-candidate': [ObservedIceCandidate];
	'removed-ice-candidate-pair': [ObservedIceCandidatePair];
	'removed-ice-transport': [ObservedIceTransport];
	'removed-inbound-rtp': [ObservedInboundRtp];
	'removed-inbound-track': [ObservedInboundTrack];
	'removed-media-playout': [ObservedMediaPlayout];
	'removed-media-source': [ObservedMediaSource];
	'removed-outbound-rtp': [ObservedOutboundRtp];
	'removed-outbound-track': [ObservedOutboundTrack];
	'removed-peer-connection-transport': [ObservedPeerConnectionTransport];
	'removed-remote-inbound-rtp': [ObservedRemoteInboundRtp];
	'removed-remote-outbound-rtp': [ObservedRemoteOutboundRtp];
	'updated-inbound-rtp': [ObservedInboundRtp];
	'updated-outbound-rtp': [ObservedOutboundRtp];
	'updated-inbound-track': [ObservedInboundTrack];
	'updated-outbound-track': [ObservedOutboundTrack];
	'updated-ice-candidate-pair': [ObservedIceCandidatePair];
	'updated-ice-transport': [ObservedIceTransport];
	'updated-peer-connection-transport': [ObservedPeerConnectionTransport];
	'updated-media-source': [ObservedMediaSource];
	'updated-media-playout': [ObservedMediaPlayout];
	'updated-data-channel': [ObservedDataChannel];
	'updated-ice-candidate': [ObservedIceCandidate];
	'updated-certificate': [ObservedCertificate];
	'updated-codec': [ObservedCodec];
	'updated-remote-inbound-rtp': [ObservedRemoteInboundRtp];
	'updated-remote-outbound-rtp': [ObservedRemoteOutboundRtp];
	'muted-inbound-track': [ObservedInboundTrack];
	'muted-outbound-track': [ObservedOutboundTrack];
	'unmuted-inbound-track': [ObservedInboundTrack];
	'unmuted-outbound-track': [ObservedOutboundTrack];

	'update': [],
	close: [];
};

export declare interface ObservedPeerConnection {
	on<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	off<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	once<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	emit<U extends keyof ObservedPeerConnectionEvents>(event: U, ...args: ObservedPeerConnectionEvents[U]): boolean;
}

export class ObservedPeerConnection extends EventEmitter {
	private _visited = true;

	public appData?: Record<string, unknown>;
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	
	public closed = false;
	// timestamp of the PEER_CONNECTION_OPENED event
	public openedAt?: number;
	// timestamp of the PEER_CONNECTION_CLOSED event
	public closedAt?: number;
	public updated = Date.now();

	public connectionState?: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'; 
	public iceConnectionState?: 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';
	public iceGatheringState?: 'new' | 'gathering' | 'complete';

	public availableIncomingBitrate = 0;
	public availableOutgoingBitrate = 0;
	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;
	public totalDataChannelMessagesSent = 0;
	public totalDataChannelMessagesReceived = 0;

	public totalSentAudioBytes = 0;
	public totalSentVideoBytes = 0;
	public totalSentAudioPackets = 0;
	public totalSentVideoPackets = 0;
	public totalReceivedAudioPacktes = 0;
	public totalReceivedVideoPackets = 0;
	public totalReceivedAudioBytes = 0;
	public totalReceivedVideoBytes = 0;

	public deltaInboundPacketsLost = 0;
	public deltaInboundPacketsReceived = 0;
	public deltaOutboundPacketsSent = 0;
	public deltaDataChannelBytesSent = 0;
	public deltaDataChannelBytesReceived = 0;
	public deltaDataChannelMessagesSent = 0;
	public deltaDataChannelMessagesReceived = 0;
	public deltaInboundReceivedBytes = 0;
	public deltaOutboundSentBytes = 0;

	public deltaReceivedAudioBytes = 0;
	public deltaReceivedVideoBytes = 0;
	public deltaReceivedAudioPackets = 0;
	public deltaReceivedVideoPackets = 0;
	public deltaSentAudioBytes = 0;
	public deltaSentVideoBytes = 0;
	public deltaTransportSentBytes = 0;
	public deltaTransportReceivedBytes = 0;

	public receivingPacketsPerSecond = 0;
	public sendingPacketsPerSecond = 0;
	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;

	public currentRttInMs?: number;
	public currentJitter?: number;

	public usingTCP = false;
	public usingTURN = false;

	public observedTurnServer?: ObservedTurnServer;
	public readonly observedCertificates = new Map<string, ObservedCertificate>();
	public readonly observedCodecs = new Map<string, ObservedCodec>();
	public readonly observedDataChannels = new Map<string, ObservedDataChannel>();
	public readonly observedIceCandidates = new Map<string, ObservedIceCandidate>();
	public readonly observedIceCandidatesPair = new Map<string, ObservedIceCandidatePair>();
	public readonly observedIceTransports = new Map<string, ObservedIceTransport>();
	public readonly observedInboundRtps = new Map<number, ObservedInboundRtp>();
	public readonly observedInboundTracks = new Map<string, ObservedInboundTrack>();
	public readonly observedMediaPlayouts = new Map<string, ObservedMediaPlayout>();
	public readonly observedMediaSources = new Map<string, ObservedMediaSource>();
	public readonly observedOutboundRtps = new Map<number, ObservedOutboundRtp>();
	public readonly observedOutboundTracks = new Map<string, ObservedOutboundTrack>();
	public readonly observedPeerConnectionTransports = new Map<string, ObservedPeerConnectionTransport>();
	public readonly observedRemoteInboundRtps = new Map<number, ObservedRemoteInboundRtp>();
	public readonly observedRemoteOutboundRtps = new Map<number, ObservedRemoteOutboundRtp>();

	public constructor(public readonly peerConnectionId: string, public readonly client: ObservedClient) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get score() { 
		return this.calculatedScore.value; 
	}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public get codecs() {
		return [ ...this.observedCodecs.values() ];
	}

	public get inboundRtps() {
		return [ ...this.observedInboundRtps.values() ];
	}

	public get remoteOutboundRtps() {
		return [ ...this.observedRemoteOutboundRtps.values() ];
	}

	public get outboundRtps() {
		return [ ...this.observedOutboundRtps.values() ];
	}

	public get remoteInboundRtps() {
		return [ ...this.observedRemoteInboundRtps.values() ];
	}

	public get mediaSources() {
		return [ ...this.observedMediaSources.values() ];
	}

	public get mediaPlayouts() {
		return [ ...this.observedMediaPlayouts.values() ];
	}

	public get dataChannels() {
		return [ ...this.observedDataChannels.values() ];
	}

	public get peerConnectionTransports() {
		return [ ...this.observedPeerConnectionTransports.values() ];
	}

	public get iceTransports() {
		return [ ...this.observedIceTransports.values() ];
	}

	public get iceCandidates() {
		return [ ...this.observedIceCandidates.values() ];
	}

	public get iceCandidatePairs() {
		return [ ...this.observedIceCandidatesPair.values() ];
	}

	public get certificates() {
		return [ ...this.observedCertificates.values() ];
	}

	public get selectedIceCandidatePairs() {
		return this.iceTransports.map((iceTransport) => iceTransport.getSelectedCandidatePair())
			.filter((pair) => pair !== undefined) as ObservedIceCandidatePair[];
	}

	public get selectedIceCandiadtePairForTurn() {
		return this.selectedIceCandidatePairs
			.filter((pair) => 
				pair.getLocalCandidate()?.candidateType === 'relay' && 
				pair.getRemoteCandidate()?.url?.startsWith('turn:')
			);
	}

	public close() {
		if (this.closed) return;
		this.closed = true;

		this.observedCertificates.forEach((cert) => this.emit('removed-certificate', cert));
		this.observedCodecs.forEach((codec) => this.emit('removed-codec', codec));
		this.observedDataChannels.forEach((dc) => this.emit('removed-data-channel', dc));
		this.observedIceCandidates.forEach((candidate) => this.emit('removed-ice-candidate', candidate));
		this.observedIceCandidatesPair.forEach((pair) => this.emit('removed-ice-candidate-pair', pair));
		this.observedIceTransports.forEach((transport) => this.emit('removed-ice-transport', transport));
		this.observedInboundRtps.forEach((rtp) => this.emit('removed-inbound-rtp', rtp));
		this.observedInboundTracks.forEach((track) => this.emit('removed-inbound-track', track));
		this.observedMediaPlayouts.forEach((playout) => this.emit('removed-media-playout', playout));
		this.observedMediaSources.forEach((source) => this.emit('removed-media-source', source));
		this.observedOutboundRtps.forEach((rtp) => this.emit('removed-outbound-rtp', rtp));
		this.observedOutboundTracks.forEach((track) => this.emit('removed-outbound-track', track));
		this.observedPeerConnectionTransports.forEach((transport) => this.emit('removed-peer-connection-transport', transport));
		this.observedRemoteInboundRtps.forEach((rtp) => this.emit('removed-remote-inbound-rtp', rtp));
		this.observedRemoteOutboundRtps.forEach((rtp) => this.emit('removed-remote-outbound-rtp', rtp));

		this.observedCertificates.clear();
		this.observedCodecs.clear();
		this.observedDataChannels.clear();
		this.observedIceCandidates.clear();
		this.observedIceCandidatesPair.clear();
		this.observedIceTransports.clear();
		this.observedInboundRtps.clear();
		this.observedInboundTracks.clear();
		this.observedMediaPlayouts.clear();
		this.observedMediaSources.clear();
		this.observedOutboundRtps.clear();
		this.observedOutboundTracks.clear();
		this.observedPeerConnectionTransports.clear();
		this.observedRemoteInboundRtps.clear();
		this.observedRemoteOutboundRtps.clear();

		this.client.call.observer.observedTURN.removePeerConnection(this);
		
		if (!this.closedAt) this.closedAt = Date.now();
		
		this.emit('close');
	}

	public accept(sample: PeerConnectionSample) {
		if (this.closed) return;
		this._visited = true;

		this.availableIncomingBitrate = 0;
		this.availableOutgoingBitrate = 0;
		this.deltaInboundPacketsLost = 0;
		this.deltaInboundPacketsReceived = 0;
		this.deltaOutboundPacketsSent = 0;
		this.deltaDataChannelBytesSent = 0;
		this.deltaDataChannelBytesReceived = 0;
		this.deltaInboundReceivedBytes = 0;
		this.deltaOutboundSentBytes = 0;
		this.deltaReceivedAudioBytes = 0;
		this.deltaReceivedVideoBytes = 0;
		this.deltaReceivedAudioPackets = 0;
		this.deltaReceivedVideoPackets = 0;
		this.deltaSentAudioBytes = 0;
		this.deltaSentVideoBytes = 0;
		this.deltaTransportReceivedBytes = 0;
		this.deltaTransportSentBytes = 0;

		this.sendingAudioBitrate = 0;
		this.sendingVideoBitrate = 0;
		this.receivingAudioBitrate = 0;
		this.receivingVideoBitrate = 0;

		const now = Date.now();
		const elapsedTimeInMs = now - this.updated;
		const elapsedTimeInSec = elapsedTimeInMs / 1000;
		const rttMeasurementsInSec: number[] = [];
		const jitterMeasurements: number[] = [];

		if (sample.certificates) {
			for (const certificate of sample.certificates) {
				this._updateCertificateStats(certificate);
			}
		}
		if (sample.codecs) {
			for (const codec of sample.codecs) {
				this._updateCodecStats(codec);
			}
		}
		if (sample.dataChannels) {
			for (const dataChannel of sample.dataChannels) {
				const observedDataChannel = this._updateDataChannelStats(dataChannel);

				if (!observedDataChannel) continue;

				this.deltaDataChannelBytesSent += observedDataChannel.deltaBytesSent;
				this.deltaDataChannelBytesReceived += observedDataChannel.deltaBytesReceived;
				this.deltaDataChannelMessagesSent += observedDataChannel.deltaMessagesSent;
				this.deltaDataChannelMessagesReceived += observedDataChannel.deltaMessagesReceived;
			}
		}
		if (sample.iceCandidates) {
			for (const iceCandidate of sample.iceCandidates) {
				this._updateIceCandidateStats(iceCandidate);
			}
		}
		if (sample.iceCandidatePairs) {
			for (const iceCandidatePair of sample.iceCandidatePairs) {
				const observedCandidatePair = this._updateIceCandidatePairStats(iceCandidatePair);

				if (!observedCandidatePair) continue;

				if (observedCandidatePair.currentRoundTripTime) {
					rttMeasurementsInSec.push(observedCandidatePair.currentRoundTripTime);
				}
				if (observedCandidatePair.availableIncomingBitrate) {
					this.availableIncomingBitrate += observedCandidatePair.availableIncomingBitrate;
				}
				if (observedCandidatePair.availableOutgoingBitrate) {
					this.availableOutgoingBitrate += observedCandidatePair.availableOutgoingBitrate;
				}
			}
		}
		if (sample.iceTransports) {
			for (const iceTransport of sample.iceTransports) {
				const observedIceTransport = this._updateIceTransportStats(iceTransport);

				if (!observedIceTransport) return;

				observedIceTransport.bytesReceived;

			}
		}
		if (sample.inboundRtps) {
			for (const inboundRtp of sample.inboundRtps) {
				const observedInboundRtp = this._updateInboundRtpStats(inboundRtp);
				
				if (!observedInboundRtp) continue;

				this.deltaInboundPacketsLost += observedInboundRtp.deltaLostPackets;
				this.deltaInboundPacketsReceived += observedInboundRtp.deltaReceivedPackets;
				this.deltaInboundReceivedBytes += observedInboundRtp.deltaBytesReceived;
				
				switch (inboundRtp.kind) {
					case 'audio':
						this.deltaReceivedAudioBytes += observedInboundRtp.deltaBytesReceived;
						this.deltaReceivedAudioPackets += observedInboundRtp.deltaReceivedPackets;
						break;
					case 'video':
						this.deltaReceivedVideoBytes += observedInboundRtp.deltaBytesReceived;
						this.deltaReceivedVideoPackets += observedInboundRtp.deltaReceivedPackets;
						break;
				}

				if (observedInboundRtp.jitter) {
					jitterMeasurements.push(observedInboundRtp.jitter);
				}
			}
		}
		if (sample.mediaPlayouts) {
			for (const mediaPlayout of sample.mediaPlayouts) {
				this._updateMediaPlayoutStats(mediaPlayout);
			}
		}
		if (sample.mediaSources) {
			for (const mediaSource of sample.mediaSources) {
				this._updateMediaSourceStats(mediaSource);
			}
		}
		if (sample.outboundRtps) {
			for (const outboundRtp of sample.outboundRtps) {
				const observedOutboundRtp = this._updateOutboundRtpStats(outboundRtp);
			
				if (!observedOutboundRtp) continue;

				this.deltaOutboundPacketsSent += observedOutboundRtp.deltaPacketsSent ?? 0;
				this.deltaOutboundSentBytes += observedOutboundRtp.deltaBytesSent ?? 0;

				switch (outboundRtp.kind) {
					case 'audio':
						this.deltaSentAudioBytes += observedOutboundRtp.deltaBytesSent;
						this.deltaSentAudioBytes += observedOutboundRtp.deltaPacketsSent;
						break;
					case 'video':
						this.deltaSentVideoBytes += observedOutboundRtp.deltaBytesSent;
						this.deltaSentVideoBytes += observedOutboundRtp.deltaPacketsSent;
						break;
				}

			}
		}
		if (sample.peerConnectionTransports) {
			for (const peerConnectionTransport of sample.peerConnectionTransports) {
				const observedTransport = this._updatePeerConnectionTransportStats(peerConnectionTransport);
				
				if (!observedTransport) continue;

			}
		}
		if (sample.remoteInboundRtps) {
			for (const remoteInboundRtp of sample.remoteInboundRtps) {
				const observedRemoteInboundRtp = this._updateRemoteInboundRtpStats(remoteInboundRtp);

				if (!observedRemoteInboundRtp) continue;

				if (observedRemoteInboundRtp.roundTripTime) {
					rttMeasurementsInSec.push(observedRemoteInboundRtp.roundTripTime);
				}
			}
		}
		if (sample.remoteOutboundRtps) {
			for (const remoteOutboundRtp of sample.remoteOutboundRtps) {
				const observedRemoteOutboundRtp = this._updateRemoteOutboundRtpStats(remoteOutboundRtp);
			
				if (!observedRemoteOutboundRtp) continue;
			}
		}

		// tracks should be updated last as they are derived stats
		// and depends on base stats but they all received in the sample sample
		if (sample.inboundTracks) {
			for (const inboundTrack of sample.inboundTracks) {
				this._updateInboundTrackSample(inboundTrack);
			}
		}
		if (sample.outboundTracks) {
			for (const outboundTrack of sample.outboundTracks) {
				this._updateOutboundTrackSample(outboundTrack);
			}
		}

		this.totalInboundPacketsLost += this.deltaInboundPacketsLost;
		this.totalInboundPacketsReceived += this.deltaInboundPacketsReceived;
		this.totalOutboundPacketsSent += this.deltaOutboundPacketsSent;
		this.totalDataChannelBytesSent += this.deltaDataChannelBytesSent;
		this.totalDataChannelBytesReceived += this.deltaDataChannelBytesReceived;
		this.totalDataChannelMessagesSent += this.deltaDataChannelMessagesSent;
		this.totalDataChannelMessagesReceived += this.deltaDataChannelMessagesReceived;
		this.totalReceivedAudioBytes += this.deltaReceivedAudioBytes;
		this.totalReceivedVideoBytes += this.deltaReceivedVideoBytes;
		this.totalSentAudioBytes += this.deltaSentAudioBytes;
		this.totalSentVideoBytes += this.deltaSentVideoBytes;
		this.totalReceivedAudioPacktes += this.deltaReceivedAudioPackets;
		this.totalReceivedVideoPackets += this.deltaReceivedVideoPackets;
		this.totalSentAudioPackets += this.deltaSentAudioBytes;
		this.totalSentVideoPackets += this.deltaSentVideoBytes;

		this.receivingPacketsPerSecond = this.deltaInboundPacketsReceived / elapsedTimeInSec;
		this.sendingPacketsPerSecond = this.deltaOutboundPacketsSent / elapsedTimeInSec;
		this.sendingAudioBitrate = (this.deltaSentAudioBytes * 8) / elapsedTimeInSec;
		this.sendingVideoBitrate = (this.deltaSentVideoBytes * 8) / elapsedTimeInSec;
		this.receivingAudioBitrate = (this.deltaReceivedAudioBytes * 8) / elapsedTimeInSec;
		this.receivingVideoBitrate = (this.deltaReceivedVideoBytes * 8) / elapsedTimeInSec;

		if (rttMeasurementsInSec.length > 0) {
			this.currentRttInMs = getMedian(rttMeasurementsInSec, false) * 1000;
		} else {
			this.currentRttInMs = undefined;
		}
		if (jitterMeasurements.length > 0) {
			this.currentJitter = getMedian(jitterMeasurements, false);
		} else {
			this.currentJitter = undefined;
		}
		const wasUsingTURN = this.usingTURN;
		const selectedIceCandidatePairs = this.selectedIceCandidatePairs;
		const selectedCandidatePairForTurn: ObservedIceCandidatePair[] = [];

		this.usingTCP = false;
		this.usingTURN = false;

		for (const selectedCandidatePair of selectedIceCandidatePairs) {
			if (selectedCandidatePair.getLocalCandidate()?.protocol === 'tcp') {
				this.usingTCP = true;
			}
			if (selectedCandidatePair.getLocalCandidate()?.candidateType === 'relay' && selectedCandidatePair.getRemoteCandidate()?.url?.startsWith('turn:')) {
				selectedCandidatePairForTurn.push(selectedCandidatePair);
				this.usingTURN = true;
			}
			this.deltaTransportReceivedBytes += selectedCandidatePair.deltaBytesReceived;
			this.deltaTransportSentBytes += selectedCandidatePair.deltaBytesSent;
		}

		if (this.usingTURN) {
			if (!this.observedTurnServer) {
				this.observedTurnServer = this.client.call.observer.observedTURN.addPeerConnection(this);
			}
			this.observedTurnServer?.updateTurnUsage(...selectedCandidatePairForTurn);
		} else if (wasUsingTURN) {
			if (!this.usingTURN) {
				this.client.call.observer.observedTURN.removePeerConnection(this);
			}
		}
		this.calculatedScore.value = sample.score;
		this.updated = now;
		this._checkVisited();

		this.emit('update');
	}

	private _checkVisited() {
		for (const certificate of [ ...this.observedCertificates.values() ]) {
			if (certificate.visited) continue;

			this.observedCertificates.delete(certificate.id);
		}
		for (const codec of [ ...this.observedCodecs.values() ]) {
			if (codec.visited) continue;

			this.observedCodecs.delete(codec.id);
			this.emit('removed-codec', codec);
		}
		for (const dataChannel of [ ...this.observedDataChannels.values() ]) {
			if (dataChannel.visited) continue;

			this.observedDataChannels.delete(dataChannel.id);
			this.emit('removed-data-channel', dataChannel);
		}
		for (const iceCandidate of [ ...this.observedIceCandidates.values() ]) {
			if (iceCandidate.visited) continue;

			this.observedIceCandidates.delete(iceCandidate.id);
			this.emit('removed-ice-candidate', iceCandidate);
		}
		for (const iceCandidatePair of [ ...this.observedIceCandidatesPair.values() ]) {
			if (iceCandidatePair.visited) continue;

			this.observedIceCandidatesPair.delete(iceCandidatePair.id);
			this.emit('removed-ice-candidate-pair', iceCandidatePair);
		}
		for (const iceTransport of [ ...this.observedIceTransports.values() ]) {
			if (iceTransport.visited) continue;

			this.observedIceTransports.delete(iceTransport.id);
			this.emit('removed-ice-transport', iceTransport);
		}
		for (const inboundRtp of [ ...this.observedInboundRtps.values() ]) {
			if (inboundRtp.visited) continue;

			this.observedInboundRtps.delete(inboundRtp.ssrc);
			this.emit('removed-inbound-rtp', inboundRtp);
		}
		for (const inboundTrack of [ ...this.observedInboundTracks.values() ]) {
			if (inboundTrack.visited) continue;

			this.observedInboundTracks.delete(inboundTrack.id);
			this.emit('removed-inbound-track', inboundTrack);
		}
		for (const mediaPlayout of [ ...this.observedMediaPlayouts.values() ]) {
			if (mediaPlayout.visited) continue;

			this.observedMediaPlayouts.delete(mediaPlayout.id);
			this.emit('removed-media-playout', mediaPlayout);
		}
		for (const mediaSource of [ ...this.observedMediaSources.values() ]) {
			if (mediaSource.visited) continue;

			this.observedMediaSources.delete(mediaSource.id);
			this.emit('removed-media-source', mediaSource);
		}
		for (const outboundRtp of [ ...this.observedOutboundRtps.values() ]) {
			if (outboundRtp.visited) continue;

			this.observedOutboundRtps.delete(outboundRtp.ssrc);
			this.emit('removed-outbound-rtp', outboundRtp);
		}
		for (const outboundTrack of [ ...this.observedOutboundTracks.values() ]) {
			if (outboundTrack.visited) continue;

			this.observedOutboundTracks.delete(outboundTrack.id);
			this.emit('removed-outbound-track', outboundTrack);
		}
		for (const peerConnectionTransport of [ ...this.observedPeerConnectionTransports.values() ]) {
			if (peerConnectionTransport.visited) continue;

			this.observedPeerConnectionTransports.delete(peerConnectionTransport.id);
			this.emit('removed-peer-connection-transport', peerConnectionTransport);
		}
		for (const remoteInboundRtp of [ ...this.observedRemoteInboundRtps.values() ]) {
			if (remoteInboundRtp.visited) continue;

			this.observedRemoteInboundRtps.delete(remoteInboundRtp.ssrc);
			this.emit('removed-remote-inbound-rtp', remoteInboundRtp);
		}
		for (const remoteOutboundRtp of [ ...this.observedRemoteOutboundRtps.values() ]) {
			if (remoteOutboundRtp.visited) continue;

			this.observedRemoteOutboundRtps.delete(remoteOutboundRtp.ssrc);
			this.emit('removed-remote-outbound-rtp', remoteOutboundRtp);
		}
	}

	private _updateCertificateStats(stats: CertificateStats) {
		let observedCertificate = this.observedCertificates.get(stats.id);

		if (!observedCertificate) {
			if (!stats.timestamp || !stats.id || !stats.fingerprint) {
				return logger.warn(
					`ObservedPeerConnection received an invalid CertificateStats (missing timestamp OR id OR fingerprint field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedCertificate = new ObservedCertificate(stats.timestamp, stats.id, this);

			observedCertificate.update(stats);

			this.observedCertificates.set(stats.id, observedCertificate);
			this.emit('added-certificate', observedCertificate);
		} else {
			observedCertificate.update(stats);
			this.emit('updated-certificate', observedCertificate);
		}

		return observedCertificate;
	}

	private _updateCodecStats(stats: CodecStats) {
		let observedCodec = this.observedCodecs.get(stats.id);

		if (!observedCodec) {
			if (!stats.timestamp || !stats.id || !stats.mimeType) {
				return logger.warn(
					`ObservedPeerConnection received an invalid CodecStats (missing timestamp OR id OR mimeType field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedCodec = new ObservedCodec(stats.timestamp, stats.id, stats.mimeType, this);

			observedCodec.update(stats);
			
			this.observedCodecs.set(stats.id, observedCodec);
			this.emit('added-codec', observedCodec);
		} else {
			observedCodec.update(stats);
		}
		this.emit('updated-codec', observedCodec);

		return observedCodec;
	}

	private _updateDataChannelStats(stats: DataChannelStats) {
		let observedDataChannel = this.observedDataChannels.get(stats.id);

		if (!observedDataChannel) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid DataChannelStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedDataChannel = new ObservedDataChannel(stats.timestamp, stats.id, this);

			observedDataChannel.update(stats);

			this.observedDataChannels.set(stats.id, observedDataChannel);
			this.emit('added-data-channel', observedDataChannel);
		} else {
			observedDataChannel.update(stats);
		}
		this.emit('updated-data-channel', observedDataChannel);

		return observedDataChannel;
	}

	private _updateIceCandidateStats(stats: IceCandidateStats) {
		let observedIceCandidate = this.observedIceCandidates.get(stats.id);

		if (!observedIceCandidate) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceCandidate = new ObservedIceCandidate(stats.timestamp, stats.id, this);

			observedIceCandidate.update(stats);

			this.observedIceCandidates.set(stats.id, observedIceCandidate);
			this.emit('added-ice-candidate', observedIceCandidate);
		} else {
			observedIceCandidate.update(stats);
		}
		this.emit('updated-ice-candidate', observedIceCandidate);

		return observedIceCandidate;
	}

	private _updateIceCandidatePairStats(stats: IceCandidateStats) {
		let observedIceCandidatePair = this.observedIceCandidatesPair.get(stats.id);

		if (!observedIceCandidatePair) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceCandidatePair = new ObservedIceCandidatePair(stats.timestamp, stats.id, this);

			observedIceCandidatePair.update(stats);
			
			this.observedIceCandidatesPair.set(stats.id, observedIceCandidatePair);
			this.emit('added-ice-candidate-pair', observedIceCandidatePair);
		} else {
			observedIceCandidatePair.update(stats);
		}
		this.emit('updated-ice-candidate-pair', observedIceCandidatePair);

		return observedIceCandidatePair;
	}

	private _updateIceTransportStats(stats: IceCandidateStats) {
		let observedIceTransport = this.observedIceTransports.get(stats.id);

		if (!observedIceTransport) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceTransport = new ObservedIceTransport(stats.timestamp, stats.id, this);

			observedIceTransport.update(stats);
			
			this.observedIceTransports.set(stats.id, observedIceTransport);
			this.emit('added-ice-transport', observedIceTransport);
		} else {
			observedIceTransport.update(stats);
		}
		this.emit('updated-ice-transport', observedIceTransport);

		return observedIceTransport;
	}

	private _updateInboundRtpStats(stats: InboundRtpStats) {
		let observedInboundRtp = this.observedInboundRtps.get(stats.ssrc);

		if (!observedInboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind || !stats.trackIdentifier) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR ssrc OR kind OR trackIdentifier field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedInboundRtp = new ObservedInboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				stats.trackIdentifier,
				this
			);
			
			observedInboundRtp.update(stats);

			this.observedInboundRtps.set(stats.ssrc, observedInboundRtp);
			this.emit('added-inbound-rtp', observedInboundRtp);
		} else {
			observedInboundRtp.update(stats);
		}
		this.emit('updated-inbound-rtp', observedInboundRtp);

		return observedInboundRtp;
	}

	private _updateInboundTrackSample(stats: InboundTrackSample) {
		let observedInboundTrack = this.observedInboundTracks.get(stats.id);

		if (!observedInboundTrack) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundTrackSample (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			const inboundRtp = [ ...this.observedInboundRtps.values() ].find((inbRtp) => inbRtp.trackIdentifier === stats.id);
			const mediaPlayout = inboundRtp ? 
				[ ...this.observedMediaPlayouts.values() ].find((mp) => mp.id === inboundRtp.playoutId) : undefined;

			observedInboundTrack = new ObservedInboundTrack(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this,
				inboundRtp,
				mediaPlayout,
			);

			observedInboundTrack.update(stats);
			
			this.observedInboundTracks.set(stats.id, observedInboundTrack);
			this.emit('added-inbound-track', observedInboundTrack);
		} else {
			observedInboundTrack.update(stats);
		}
		this.emit('updated-inbound-track', observedInboundTrack);

		return observedInboundTrack;
	}

	private _updateMediaPlayoutStats(stats: MediaPlayoutStats) {
		let observedMediaPlayout = this.observedMediaPlayouts.get(stats.id);

		if (!observedMediaPlayout) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR kind OR trackIdentifier field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedMediaPlayout = new ObservedMediaPlayout(
				stats.timestamp, 
				stats.id, 
				stats.kind as MediaKind, 
				this
			);

			observedMediaPlayout.update(stats);

			this.observedMediaPlayouts.set(stats.id, observedMediaPlayout);
			this.emit('added-media-playout', observedMediaPlayout);
		} else {
			observedMediaPlayout.update(stats);
		}
		this.emit('updated-media-playout', observedMediaPlayout);

		return observedMediaPlayout;
	}

	private _updateMediaSourceStats(stats: MediaSourceStats) {
		let observedMediaSource = this.observedMediaSources.get(stats.id);

		if (!observedMediaSource) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedMediaSource = new ObservedMediaSource(
				stats.timestamp, 
				stats.id, 
				stats.kind as MediaKind, 
				this
			);

			observedMediaSource.update(stats);

			this.observedMediaSources.set(stats.id, observedMediaSource);
			this.emit('added-media-source', observedMediaSource);
		} else {
			observedMediaSource.update(stats);
		}
		this.emit('updated-media-source', observedMediaSource);

		return observedMediaSource;
	}

	private _updateOutboundRtpStats(stats: OutboundRtpStats) {
		let observedOutboundRtp = this.observedOutboundRtps.get(stats.ssrc);

		if (!observedOutboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid OutboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedOutboundRtp = new ObservedOutboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedOutboundRtp.update(stats);

			this.observedOutboundRtps.set(stats.ssrc, observedOutboundRtp);
			this.emit('added-outbound-rtp', observedOutboundRtp);
		} else {
			observedOutboundRtp.update(stats);
		}
		this.emit('updated-outbound-rtp', observedOutboundRtp);
		
		return observedOutboundRtp;
	}

	public _updateOutboundTrackSample(stats: OutboundTrackSample) {
		let observedOutboundTrack = this.observedOutboundTracks.get(stats.id);

		if (!observedOutboundTrack) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid OutboundTrackSample (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}
			const observedMediaSource = [ ...this.observedMediaSources.values() ].find((mediaSource) => mediaSource.trackIdentifier === stats.id);
			const outboundRtps = observedMediaSource 
				? [ ...this.observedOutboundRtps.values() ].filter((outboundRtp) => outboundRtp.mediaSourceId === observedMediaSource?.id) : undefined;

			observedOutboundTrack = new ObservedOutboundTrack(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this,
				outboundRtps,
				observedMediaSource,
			);

			observedOutboundTrack.update(stats);

			this.observedOutboundTracks.set(stats.id, observedOutboundTrack);
			this.emit('added-outbound-track', observedOutboundTrack);
		} else {
			observedOutboundTrack.update(stats);
		}
		this.emit('updated-outbound-track', observedOutboundTrack);

		return observedOutboundTrack;
	}

	private _updatePeerConnectionTransportStats(stats: PeerConnectionTransportStats) {
		let observedPeerConnectionTransport = this.observedPeerConnectionTransports.get(stats.id);

		if (!observedPeerConnectionTransport) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid PeerConnectionTransportStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedPeerConnectionTransport = new ObservedPeerConnectionTransport(stats.timestamp, stats.id, this);

			observedPeerConnectionTransport.update(stats);

			this.observedPeerConnectionTransports.set(stats.id, observedPeerConnectionTransport);
			this.emit('added-peer-connection-transport', observedPeerConnectionTransport);
		} else {
			observedPeerConnectionTransport.update(stats);
		}
		this.emit('updated-peer-connection-transport', observedPeerConnectionTransport);

		return observedPeerConnectionTransport;
	}

	private _updateRemoteInboundRtpStats(stats: RemoteInboundRtpStats) {
		let observedRemoteInboundRtp = this.observedRemoteInboundRtps.get(stats.ssrc);

		if (!observedRemoteInboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid RemoteInboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedRemoteInboundRtp = new ObservedRemoteInboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedRemoteInboundRtp.update(stats);

			this.observedRemoteInboundRtps.set(stats.ssrc, observedRemoteInboundRtp);
			this.emit('added-remote-inbound-rtp', observedRemoteInboundRtp);
		} else {
			observedRemoteInboundRtp.update(stats);
		}
		this.emit('updated-remote-inbound-rtp', observedRemoteInboundRtp);

		return observedRemoteInboundRtp;
	}

	private _updateRemoteOutboundRtpStats(stats: RemoteOutboundRtpStats) {
		let observedRemoteOutboundRtp = this.observedRemoteOutboundRtps.get(stats.ssrc);

		if (!observedRemoteOutboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid RemoteOutboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedRemoteOutboundRtp = new ObservedRemoteOutboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedRemoteOutboundRtp.update(stats);

			this.observedRemoteOutboundRtps.set(stats.ssrc, observedRemoteOutboundRtp);
			this.emit('added-remote-outbound-rtp', observedRemoteOutboundRtp);
		} else {
			observedRemoteOutboundRtp.update(stats);
		}
		this.emit('updated-remote-outbound-rtp', observedRemoteOutboundRtp);

		return observedRemoteOutboundRtp;
	}
}
