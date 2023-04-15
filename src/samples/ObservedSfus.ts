import { ObservedCall, ObservedCallBuilder } from './ObservedCall';
import { ObservedSfu, ObservedSfuBuilder } from './ObservedSfu';

export interface ObservedSfus {
	sfuIds(): IterableIterator<string>;
	sfuTransportIds(): IterableIterator<string>;
	sfuInboundRtpPadIds(): IterableIterator<string>;
	sfuOutboundRtpPadIds(): IterableIterator<string>;

	observedSfus(): IterableIterator<ObservedSfu>;
	getObservedSfu(sfuId: string): ObservedSfu | undefined;
}

export class ObservedSfusBuilder {
	private _builders = new Map<string, ObservedSfuBuilder>();
	public constructor() {
		// nothing
	}

	public getOrCreateObservedSfuBuilder(
		sfuId: string,
		configSupplier: () => ConstructorParameters<typeof ObservedSfuBuilder>[0]
	) {
		let result = this._builders.get(sfuId);
		if (!result) {
			const config = configSupplier();
			result = new ObservedSfuBuilder(config);
			this._builders.set(sfuId, result);
		}
		return result;
	}

	public build(): ObservedSfus {
		const observedSfus = new Map<string, ObservedSfu>();

		const sfuIds = function* (): IterableIterator<string> {
			for (const observedSfu of observedSfus.values()) {
				yield observedSfu.sfuId;
			}
		};

		const sfuTransportIds = function* (): IterableIterator<string> {
			for (const observedSfu of observedSfus.values()) {
				for (const observedTransport of observedSfu.observedSfuTransports()) {
					yield observedTransport.transportId;
				}
			}
		};

		const sfuInboundRtpPadIds = function* (): IterableIterator<string> {
			for (const observedSfu of observedSfus.values()) {
				for (const observedTransport of observedSfu.observedSfuTransports()) {
					for (const sfuInboundRtpPad of observedTransport.inboundRtpPads()) {
						yield sfuInboundRtpPad.padId;
					}
				}
			}
		};

		const sfuOutboundRtpPadIds = function* (): IterableIterator<string> {
			for (const observedSfu of observedSfus.values()) {
				for (const observedTransport of observedSfu.observedSfuTransports()) {
					for (const sfuOutboundRtpPad of observedTransport.outboundRtpPads()) {
						yield sfuOutboundRtpPad.padId;
					}
				}
			}
		};


		const result: ObservedSfus = {
			sfuIds,
			sfuTransportIds,
			sfuInboundRtpPadIds,
			sfuOutboundRtpPadIds,
			observedSfus: () => observedSfus.values(),
			getObservedSfu: (sfuId) => observedSfus.get(sfuId),
		};
		for (const builder of this._builders.values()) {
			const observedSfu = builder.build();
			observedSfus.set(observedSfu.sfuId, observedSfu);
		}
		return result;
	}
}
