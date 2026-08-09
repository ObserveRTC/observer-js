export interface Detector {
	readonly name: string;

	/** Called on every entity update; may raise issues via the entity it observes. */
	update(): void;

	/**
	 * Optional teardown, called when the detector is removed from its registry (or the registry is
	 * cleared, which happens when the owning call/observer closes). Implement it when the detector
	 * subscribes to events or holds timers, so it doesn't leak.
	 */
	close?(): void;
}
