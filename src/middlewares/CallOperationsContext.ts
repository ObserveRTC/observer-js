import { Semaphore } from '../common/Semaphore';
import { EvaluatorContext } from '../common/types';
import { Writable } from '../common/utils';
import { ObservedClientSourceConfig } from '../sources/ObservedClientSource';

export type CallOperationsContext = {
	joinedClients: ObservedClientSourceConfig[];
	detachedClients: (ObservedClientSourceConfig & {
		detached: number;
	})[];

	evaluatorContext?: Writable<EvaluatorContext>;
};

export type CallOperation =
	| (ObservedClientSourceConfig & {
        type: 'join';
    }) | (ObservedClientSourceConfig & {
        type: 'detach';
        detached: number;
    });

export function createCallOperationContext(
	clientOperations: Map<string, CallOperation>,
	evaluatorContext?: Writable<EvaluatorContext>
): CallOperationsContext {
	const joinedClients: CallOperationsContext['joinedClients'] = [];
	const detachedClients: CallOperationsContext['detachedClients'] = [];
	for (const clientOperation of clientOperations.values()) {
		switch (clientOperation.type) {
			case 'join': {
				const joinedClient: CallOperationsContext['joinedClients'][number] = {
					...clientOperation,
				};
				joinedClients.push(joinedClient);
				break;
			}
			case 'detach': {
				const detachedClient: CallOperationsContext['detachedClients'][number] = {
					...clientOperation,
				};
				detachedClients.push(detachedClient);
				break;
			}
		}
	}
	return {
		joinedClients,
		detachedClients,

		evaluatorContext,
	};
}
