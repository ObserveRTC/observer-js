import { ReportsCollector } from '../common/ReportsCollector';
import { createDetachClientProcess, DetachClientProcessInput } from '../processes/detachClientProcess';
import { createJoinClientProcess, JoinClientProcessInput } from '../processes/joinClientProcess';
import { StorageProvider } from '../storages/StorageProvider';
import { CallOperationsContext } from './CallOperationsContext';
import { Middleware } from './Middleware';
import { createProcessor, Processor } from './Processor';

export function createCallProcessor(
	storageProvider: StorageProvider,
	reportsCollector: ReportsCollector
): Processor<CallOperationsContext> {
	const joinClientProcess = createJoinClientProcess(storageProvider, reportsCollector);
	const detachClientProcess = createDetachClientProcess(storageProvider, reportsCollector);

	const joinClientMiddleware: Middleware<CallOperationsContext> = async (context, next) => {
		const input: JoinClientProcessInput = {
			clients: context.joinedClients,

			evaluatorContext: context.evaluatorContext,
		};
		await Promise.all([joinClientProcess(input), next ? next(context) : Promise.resolve()]);
	};

	const detachClientMiddleware: Middleware<CallOperationsContext> = async (context, next) => {
		const input: DetachClientProcessInput = {
			clients: context.detachedClients,

			evaluatorContext: context.evaluatorContext,
			recursive: true,
		};
		await Promise.all([detachClientProcess(input), next ? next(context) : Promise.resolve()]);
	};

	return createProcessor(joinClientMiddleware, detachClientMiddleware);
}
