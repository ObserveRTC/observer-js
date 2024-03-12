import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { DataChannel } from '@observertc/sample-schemas-js';
import { ClientDataChannelReport } from '@observertc/report-schemas-js';

export type ObservedDataChannelState = 'connecting' | 'open' | 'closing' | 'closed';

export type ObservedDataChannelModel = {
	channelId: number;
}

export type ObservedDataChannelEvents = {
	update: [],
	close: [],
};

export type ObservedInboundTrackStats = {
	ssrc: number;
	bitrate: number;
	fractionLost: number;
	rttInMs?: number;
	lostPackets?: number;
	receivedPackets?: number;
	receivedFrames?: number;
	decodedFrames?: number;
	droppedFrames?: number;
	receivedSamples?: number;
	silentConcealedSamples?: number;
	fractionLoss?: number;
};

// {
// 	[Property in keyof ObservedInboundTrackStats<K>]: ObservedInboundTrackStats<K>[Property];
// }

export declare interface ObservedDataChannel {
	on<U extends keyof ObservedDataChannelEvents>(event: U, listener: (...args: ObservedDataChannelEvents[U]) => void): this;
	off<U extends keyof ObservedDataChannelEvents>(event: U, listener: (...args: ObservedDataChannelEvents[U]) => void): this;
	once<U extends keyof ObservedDataChannelEvents>(event: U, listener: (...args: ObservedDataChannelEvents[U]) => void): this;
	emit<U extends keyof ObservedDataChannelEvents>(event: U, ...args: ObservedDataChannelEvents[U]): boolean;
	update(sample: DataChannel, timestamp: number): void;
}

export class ObservedDataChannel extends EventEmitter	{
	public readonly created = Date.now();

	private _stats?: DataChannel;
	
	private _closed = false;
	private _updated = Date.now();
	public bitrate = 0;
	public marker?: string;

	public totalReceivedMessages = 0;
	public totalSentMessages = 0;
	public totalBytesReceived = 0;
	public totalBytesSent = 0;
	
	public deltaReceivedMessages = 0;
	public deltaSentMessages = 0;
	public deltaBytesReceived = 0;
	public deltaBytesSent = 0;

	public constructor(
		private readonly _model: ObservedDataChannelModel,
		public readonly peerConnection: ObservedPeerConnection,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get serviceId() {
		return this.peerConnection.serviceId;
	}

	public get roomId() {
		return this.peerConnection.roomId;
	}

	public get callId() {
		return this.peerConnection.callId;
	}

	public get clientId() {
		return this.peerConnection.clientId;
	}

	public get mediaUnitId() {
		return this.peerConnection.mediaUnitId;
	}

	public get peerConnectionId() {
		return this.peerConnection.peerConnectionId;
	}

	public get channelId() {
		return this._model.channelId;
	}

	public get updated() {
		return this._updated;
	}

	public get state(): ObservedDataChannelState | undefined {
		return this._stats?.state as ObservedDataChannelState | undefined;
	}

	public get label() {
		return this._stats?.label;
	}

	public get protocol() {
		return this._stats?.protocol;
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public get stats() {
		return this._stats;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;

		this._closed = true;

		this.emit('close');
	}

	public resetMetrics() {
		this.bitrate = 0;
		this.totalReceivedMessages = 0;
		this.totalSentMessages = 0;
		this.totalBytesReceived = 0;
		this.totalBytesSent = 0;
		this.deltaReceivedMessages = 0;
		this.deltaSentMessages = 0;
		this.deltaBytesReceived = 0;
	}

	public update(sample: DataChannel, timestamp: number) {
		if (this._closed) return;
		
		const now = Date.now();

		const report: ClientDataChannelReport = {
			serviceId: this.peerConnection.client.call.serviceId,
			roomId: this.peerConnection.client.call.roomId,
			callId: this.peerConnection.client.call.callId,
			clientId: this.peerConnection.client.clientId,
			userId: this.peerConnection.client.userId,
			mediaUnitId: this.peerConnection.client.mediaUnitId,
			...sample,
			timestamp,
			sampleSeq: -1,
			marker: this.marker,
		};

		this.reports.addClientDataChannelReport(report);

		sample.bytesReceived;
		sample.bytesSent;
		sample.messageReceived;
		sample.messageSent;
		
		const elapsedTimeInMs = Math.max(1, now - this._updated);

		this.bitrate = ((sample.bytesReceived ?? 0) - (this._stats?.bytesReceived ?? 0)) * 8 / (elapsedTimeInMs / 1000);
		this.deltaSentMessages = (sample.messageSent ?? 0) - (this._stats?.messageSent ?? 0);
		this.deltaReceivedMessages = (sample.messageReceived ?? 0) - (this._stats?.messageReceived ?? 0);
		this.deltaBytesSent = (sample.bytesSent ?? 0) - (this._stats?.bytesSent ?? 0);
		this.deltaBytesReceived = (sample.bytesReceived ?? 0) - (this._stats?.bytesReceived ?? 0);

		this.totalBytesReceived = sample.bytesReceived ?? 0;
		this.totalBytesSent = sample.bytesSent ?? 0;
		this.totalReceivedMessages = sample.messageReceived ?? 0;
		this.totalSentMessages = sample.messageSent ?? 0;

		this._stats = sample;
		this._updated = timestamp;
		this.emit('update');
	}
}
