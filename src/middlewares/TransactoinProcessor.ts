import { ReportsCollector } from '../common/ReportsCollector';
import { StorageProvider } from '../storages/StorageProvider';
import { createCommitTransactionMiddleware } from './CommitTransactionMiddleware';
import { Processor, createProcessor } from './Processor';
import { TransactionContext } from './TransactionContext';
import { createVisitObservedCallsMiddleware } from './VisitObservedCallsMiddleware';
import { createVisitObservedSfusMiddleware } from './VisitObservedSfusMiddleware';

export function createTransactionProcessor(
	storageProvider: StorageProvider,
	reportsCollector: ReportsCollector,
	fetchSamples: boolean
): Processor<TransactionContext> {
	return createProcessor(
		// all of these middlewares must execute sequentially!
		createVisitObservedCallsMiddleware(reportsCollector, fetchSamples),
		createVisitObservedSfusMiddleware(reportsCollector, fetchSamples),

		// must be the last one!
		createCommitTransactionMiddleware(storageProvider)
	);
}
