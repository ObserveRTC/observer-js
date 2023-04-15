import { ClientSample, SfuSample } from '@observertc/sample-schemas-js';
import { ObservedPeerConnection, ObservedPeerConnectionBuilder } from './ObservedPeerConnection';
import { ObservedCall } from './ObservedCall';
import { ObservedSfuTransport, ObservedSfuTransportBuilder } from './ObservedSfuTransport';

export interface ObservedSfu {
	readonly serviceId: string;
	readonly sfuId: string;
	readonly mediaUnitId: string;

	observedSfuTransports(): IterableIterator<ObservedSfuTransport>;
	getObservedSfuTransport(sfuId: string): ObservedSfuTransport | undefined;
	samples(): IterableIterator<SfuSample>;

	readonly marker?: string;
	readonly timeZoneId?: string;

	minTimestamp: number;
	maxTimestamp: number;
}

export class ObservedSfuBuilder {
	private _minTimestamp?: number;
	private _maxTimestamp?: number;
	private _sfuTransports = new Map<string, ObservedSfuTransportBuilder>();
	private _sfuSamples: SfuSample[] = [];
	public constructor(
		private _config: Omit<
			ObservedSfu,
			| keyof IterableIterator<ObservedPeerConnection>
			| 'samples'
			| 'observedSfuTransports'
			| 'getObservedSfuTransport'
			| 'minTimestamp'
			| 'maxTimestamp'
		>
	) {}

	public addSfuSample(sfuSample: SfuSample) {
		this._sfuSamples.push(sfuSample);

		if (sfuSample.transports) {
			for (const sfuTransport of sfuSample.transports) {
				const builder = this._getOrCreateSfuTransportBuilder(sfuTransport.transportId);
				builder.addTransportSample(sfuTransport);
			}
		}
		
		if (sfuSample.inboundRtpPads) {
			for (const inboundRtpPad of sfuSample.inboundRtpPads) {
				const builder = this._getOrCreateSfuTransportBuilder(inboundRtpPad.transportId);
				builder.addSfuInboundRtpPad(inboundRtpPad);
			}
		}

		if (sfuSample.outboundRtpPads) {
			for (const outboundRtpPad of sfuSample.outboundRtpPads) {
				const builder = this._getOrCreateSfuTransportBuilder(outboundRtpPad.transportId);
				builder.addSfuOutboundRtpPad(outboundRtpPad);
			}
		}

		if (this._minTimestamp === undefined || sfuSample.timestamp < this._minTimestamp) {
			this._minTimestamp = sfuSample.timestamp;
		}

		if (this._maxTimestamp === undefined || this._maxTimestamp < sfuSample.timestamp) {
			this._maxTimestamp = sfuSample.timestamp;
		}
	}

	private _getOrCreateSfuTransportBuilder(transportId: string): ObservedSfuTransportBuilder {
		let result = this._sfuTransports.get(transportId);
		if (!result) {
			result = new ObservedSfuTransportBuilder({
				transportId,
			});
			this._sfuTransports.set(transportId, result);
		}
		return result;
	}

	public build(): ObservedSfu {
		const observedSfuTransports = new Map<string, ObservedSfuTransport>();

		const result: ObservedSfu = {
			...this._config,
			minTimestamp: this._minTimestamp ?? Date.now(),
			maxTimestamp: this._maxTimestamp ?? Date.now(),
			samples: () => this._sfuSamples.values(),
			observedSfuTransports: () => observedSfuTransports.values(),
			getObservedSfuTransport: (transportId: string) => observedSfuTransports.get(transportId),
		};

		for (const builder of this._sfuTransports.values()) {
			const observedSfuTransport = builder.build(result);
			observedSfuTransports.set(observedSfuTransport.transportId, observedSfuTransport);
		}
		return result;
	}
}
