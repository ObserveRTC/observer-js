import { ReportsCollector } from '../common/ReportsCollector';
import { StorageProvider } from '../storages/StorageProvider';
import { createCommitTransactionMiddleware } from './CommitTransactionMiddleware';
import { Processor, createProcessor } from './Processor';
import { TransactionContext } from './TransactionContext';
import { createVisitObservedCallsMiddleware } from './VisitObservedCallsMiddleware';

export function createTransactionProcessor(
	storageProvider: StorageProvider,
	reportsCollector: ReportsCollector,
	fetchSamples: boolean
): Processor<TransactionContext> {
	return createProcessor(
		// all of these middleware must execute sequentially!
		createVisitObservedCallsMiddleware(reportsCollector, fetchSamples),

		// must be the last one!
		createCommitTransactionMiddleware(storageProvider)
	);
}
