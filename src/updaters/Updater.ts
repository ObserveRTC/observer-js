export interface Updater {
	readonly name: string;
	readonly description?: string;
	close(): void;
}