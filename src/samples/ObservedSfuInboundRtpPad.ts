import { SfuInboundRtpPad } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';

export interface ObservedSfuInboundRtpPad {
	readonly sfuTransport: ObservedSfuTransport;
	readonly padId: string;

	samples(): IterableIterator<SfuInboundRtpPad>;
}

export class ObservedSfuInboundRtpPadBuilder {
	private _samples: SfuInboundRtpPad[] = [];
	public constructor(
		private _config: Omit<
		ObservedSfuInboundRtpPad,
		| keyof IterableIterator<SfuInboundRtpPad> 
		| 'sfuTransport' 
		| 'samples'
		>
	) {}

	public addSample(sfuInboundRtpPad: SfuInboundRtpPad) {
		this._samples.push(sfuInboundRtpPad);
	}

	public build(sfuTransport: ObservedSfuTransport): ObservedSfuInboundRtpPad {
		const result: ObservedSfuInboundRtpPad = {
			sfuTransport,
			...this._config,
			samples: () => this._samples.values(),
		};
		
		return result;
	}
}
