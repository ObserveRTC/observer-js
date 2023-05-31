import { ReportsCollector } from '../common/ReportsCollector';
import { StorageProvider } from '../storages/StorageProvider';
import { createCommitTransactionMiddleware } from './CommitTransactionMiddleware';
import { createDeleteOutdatedCallEntries } from './DeleteOutdatedCallEntries';
import { createDeleteOutdatedSfuEntries } from './DeleteOutdatedSfuEntries';
import { Processor, createProcessor } from './Processor';
import { TransactionContext } from './TransactionContext';
import { createVisitObservedCallsMiddleware } from './VisitObservedCallsMiddleware';
import { createVisitObservedSfusMiddleware } from './VisitObservedSfusMiddleware';

export function createTransactionProcessor(
	storageProvider: StorageProvider,
	reportsCollector: ReportsCollector,
	fetchSamples: boolean,
	maxIdleTimeInMs: BigInt,
	findRemoteMatches?: boolean,
): Processor<TransactionContext> {
	return createProcessor(
		// all of these middlewares must execute sequentially!
		createVisitObservedCallsMiddleware(storageProvider, reportsCollector, fetchSamples, findRemoteMatches),
		createVisitObservedSfusMiddleware(reportsCollector, fetchSamples),
		createDeleteOutdatedCallEntries(storageProvider, maxIdleTimeInMs),
		createDeleteOutdatedSfuEntries(storageProvider, maxIdleTimeInMs),

		// must be the last one!
		createCommitTransactionMiddleware(storageProvider, reportsCollector)
	);
}
