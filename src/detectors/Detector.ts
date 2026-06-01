export interface Detector {
	readonly name: string;

	/** Called on every entity update; may raise issues via the entity it observes. */
	update(): void;
}
