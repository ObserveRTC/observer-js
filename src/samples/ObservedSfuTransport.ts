import {
	SfuInboundRtpPad,
	SfuOutboundRtpPad,
	SfuSctpChannel,
	SfuTransport,
} from '@observertc/sample-schemas-js';
import { ObservedSfu } from './ObservedSfu';
import { ObservedSfuInboundRtpPad, ObservedSfuInboundRtpPadBuilder } from './ObservedSfuInboundRtpPad';
import { ObservedSfuOutboundRtpPad, ObservedSfuOutboundRtpPadBuilder } from './ObservedSfuOutboundRtpPad';
import { ObservedSfuSctpChannel, ObservedSfuSctpChannelBuilder } from './ObservedSfuSctpChannel';

export interface ObservedSfuTransport {
	readonly sfu: ObservedSfu;
	readonly transportId: string;

	inboundRtpPads(): IterableIterator<ObservedSfuInboundRtpPad>;
	outboundRtpPads(): IterableIterator<ObservedSfuOutboundRtpPad>;
	sfuSctpChannels(): IterableIterator<ObservedSfuSctpChannel>;

	transportSamples(): IterableIterator<SfuTransport>;
}

export class ObservedSfuTransportBuilder {
	private _inboundRtpPads = new Map<string, ObservedSfuInboundRtpPadBuilder>();
	private _outboundRtpPads = new Map<string, ObservedSfuOutboundRtpPadBuilder>();
	private _sctpChannels = new Map<string, ObservedSfuSctpChannelBuilder>();
	private _transportSamples: SfuTransport[] = [];
	public constructor(
		private _config: Omit<
		ObservedSfuTransport,
		| keyof IterableIterator<ObservedSfuTransport>
		| 'sfu'
		| 'inboundRtpPads'
		| 'outboundRtpPads'
		| 'sfuSctpChannels'
		| 'transportSamples'
		>
	) {}

	public addTransportSample(transportSample: SfuTransport) {
		this._transportSamples.push(transportSample);
	}

	public addSfuInboundRtpPad(inboundRtpPad: SfuInboundRtpPad) {
		if (inboundRtpPad.padId) {
			const builder = this._getSfuInboundRtpPadBuilder(inboundRtpPad.padId);

			builder.addSample(inboundRtpPad);
		}
	}

	private _getSfuInboundRtpPadBuilder(padId: string): ObservedSfuInboundRtpPadBuilder {
		let result = this._inboundRtpPads.get(padId);

		if (!result) {
			result = new ObservedSfuInboundRtpPadBuilder({
				padId,
			});
			this._inboundRtpPads.set(padId, result);
		}
		
		return result;
	}

	public addSfuOutboundRtpPad(outboundRtpPad: SfuOutboundRtpPad) {
		if (outboundRtpPad.padId) {
			const builder = this._getSfuOutboundRtpPadBuilder(outboundRtpPad.padId);

			builder.addSample(outboundRtpPad);
		}
	}

	private _getSfuOutboundRtpPadBuilder(padId: string): ObservedSfuOutboundRtpPadBuilder {
		let result = this._outboundRtpPads.get(padId);

		if (!result) {
			result = new ObservedSfuOutboundRtpPadBuilder({
				padId,
			});
			this._outboundRtpPads.set(padId, result);
		}
		
		return result;
	}

	public addSfuSctpChannel(sfuSctpChannel: SfuSctpChannel) {
		if (sfuSctpChannel.channelId) {
			const builder = this._getSfuSctpChannel(sfuSctpChannel.channelId);

			builder.addSample(sfuSctpChannel);
		}
	}

	private _getSfuSctpChannel(channelId: string): ObservedSfuSctpChannelBuilder {
		let result = this._sctpChannels.get(channelId);

		if (!result) {
			result = new ObservedSfuSctpChannelBuilder({
				channelId,
			});
			this._sctpChannels.set(channelId, result);
		}
		
		return result;
	}

	public build(sfu: ObservedSfu): ObservedSfuTransport {
		const sfuInboundRtpPads = new Map<string, ObservedSfuInboundRtpPad>();
		const sfuOutboundRtpPads = new Map<string, ObservedSfuOutboundRtpPad>();
		const sfuSctpChannelsMap = new Map<string, ObservedSfuSctpChannel>();

		const result: ObservedSfuTransport = {
			sfu,
			...this._config,
			transportSamples: () => this._transportSamples.values(),

			inboundRtpPads: () => sfuInboundRtpPads.values(),
			outboundRtpPads: () => sfuOutboundRtpPads.values(),
			sfuSctpChannels: () => sfuSctpChannelsMap.values(),
		};

		for (const builder of this._inboundRtpPads.values()) {
			const observedInboundRtpPad = builder.build(result);

			sfuInboundRtpPads.set(observedInboundRtpPad.padId, observedInboundRtpPad);
		}

		for (const builder of this._outboundRtpPads.values()) {
			const observedOutboundRtpPad = builder.build(result);

			sfuOutboundRtpPads.set(observedOutboundRtpPad.padId, observedOutboundRtpPad);
		}

		for (const builder of this._sctpChannels.values()) {
			const observedSfuSctpChannel = builder.build(result);

			sfuSctpChannelsMap.set(observedSfuSctpChannel.channelId, observedSfuSctpChannel);
		}

		return result;
	}
}
