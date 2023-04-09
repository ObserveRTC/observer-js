import { ObservedClient, ObservedClientBuilder } from "./ObservedClient";

export interface ObservedCall {
	readonly serviceId: string;
	readonly roomId: string;
	readonly callId: string;
	observedClients(): IterableIterator<ObservedClient>;
	getObservedClient(clientId: string): ObservedClient | undefined;
}

export class ObservedCallBuilder {
	private _observedClientBuilders = new Map<string, ObservedClientBuilder>();
	public constructor(
		private _config: Omit<
			ObservedCall, 
			| 'observedClients'
			| 'getObservedClient'
		>
	) {
		
	}

	public getOrCreateObservedClientBuilder(
		clientId: string, 
		configSupplier: () => ConstructorParameters<typeof ObservedClientBuilder>[0]
	) {
		let result = this._observedClientBuilders.get(clientId);
		if (!result) {
			const config = configSupplier();
			result = new ObservedClientBuilder(config);
			this._observedClientBuilders.set(clientId, result);
		}
		return result;
	}

	public build(): ObservedCall {
		const observedClients = new Map<string, ObservedClient>();
		
		const observedCall: ObservedCall = {
			...this._config,
			observedClients: () => observedClients.values(),
			getObservedClient: (clientId) => observedClients.get(clientId),
		};
		for (const observedClientBuilder of this._observedClientBuilders.values()) {
			const observedClient = observedClientBuilder.build(observedCall);
			observedClients.set(observedClient.clientId, observedClient);
		}
		return observedCall;
	}
}
