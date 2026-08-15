import type { SimulcastReceiverValidator, SimulcastReceiverValidatorConfig } from './SimulcastReceiverValidator';
import type { RemoteTrackResolverValidator, RemoteTrackResolverValidatorConfig } from './RemoteTrackResolverValidator';
import type { CodecConsistencyValidator, CodecConsistencyValidatorConfig } from './CodecConsistencyValidator';

/**
 * The validators `observer.addValidator(name, config)` knows how to build, and the config each takes.
 *
 * Adding one means: write the class with a `static readonly NAME`, add its entry here, and add a
 * `case` to `addValidator`. The map is what gives the call site its types —
 * `addValidator('simulcast-receivers', { … })` type-checks the config against the right validator,
 * and an unknown name won't compile.
 */
export type AvailableValidatorConfigs = {
	[SimulcastReceiverValidator.NAME]: SimulcastReceiverValidatorConfig,
	[RemoteTrackResolverValidator.NAME]: RemoteTrackResolverValidatorConfig,
	[CodecConsistencyValidator.NAME]: CodecConsistencyValidatorConfig,
};

/** A validator name that can be started. */
export type ValidatorName = keyof AvailableValidatorConfigs;
