import type { SimulcastReceiverValidatorConfig } from './SimulcastReceiverValidator';

/**
 * The validators `observer.addValidator(name, config)` knows how to build, and the config each takes.
 *
 * Adding one means: write the class, add its entry here, and add a `case` to `addValidator`. The map
 * is what gives the call site its types — `addValidator('simulcast-receiver-validator', { … })`
 * type-checks the config against the right validator, and an unknown name won't compile.
 */
export type AvailableValidatorConfigs = {
	'simulcast-receivers': SimulcastReceiverValidatorConfig,
};
