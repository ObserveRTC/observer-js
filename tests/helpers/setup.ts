import { setObserverLogger } from '../../src/common/logger';

// Silence the library logger during tests; the warn/debug paths are exercised on purpose.
const noop = (): void => undefined;

setObserverLogger({
	trace: noop,
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
});
