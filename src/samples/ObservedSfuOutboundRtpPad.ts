import { SfuOutboundRtpPad } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';

export interface ObservedSfuOutboundRtpPad {
	readonly sfuTransport: ObservedSfuTransport;
	readonly padId: string;

	samples(): IterableIterator<SfuOutboundRtpPad>;
}

export class ObservedSfuOutboundRtpPadBuilder {
	private _samples: SfuOutboundRtpPad[] = [];
	public constructor(
		private _config: Omit<
		ObservedSfuOutboundRtpPad,
		| keyof IterableIterator<SfuOutboundRtpPad> 
		| 'sfuTransport' 
		| 'samples'
		>
	) {}

	public addSample(sfuInboundRtpPad: SfuOutboundRtpPad) {
		this._samples.push(sfuInboundRtpPad);
	}

	public build(sfuTransport: ObservedSfuTransport): ObservedSfuOutboundRtpPad {
		const result: ObservedSfuOutboundRtpPad = {
			sfuTransport,
			...this._config,
			samples: () => this._samples.values(),
		};
		
		return result;
	}
}
