import { SfuSctpChannel } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';

export interface ObservedSfuSctpChannel {
	readonly sfuTransport: ObservedSfuTransport;
	readonly channelId: string;
  
	samples(): IterableIterator<SfuSctpChannel>;
  }
  
  export class ObservedSfuSctpChannelBuilder {
	private _samples: SfuSctpChannel[] = [];
	public constructor(
	  private _config: Omit<
		ObservedSfuSctpChannel,
		| keyof IterableIterator<SfuSctpChannel>
		| 'sfuTransport'
		| 'samples'
	  >
	) {}
  
	public addSample(sfuSctpChannel: SfuSctpChannel) {
	  this._samples.push(sfuSctpChannel);
	}
  
	public build(sfuTransport: ObservedSfuTransport): ObservedSfuSctpChannel {
	  const result: ObservedSfuSctpChannel = {
		sfuTransport,
		...this._config,
		samples: () => this._samples.values(),
	  };
	  return result;
	}
  }
  