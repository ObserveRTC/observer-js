import { Updater } from './Updater';

export class OnIntervalUpdater implements Updater {
	readonly name = 'OnIntervalUpdater';
	readonly description = 'Call the update() method given in the constructor once the interval elapsed';

	public timer: ReturnType<typeof setInterval>;

	public constructor(
		intervalInMs: number,
		private readonly _update: () => void,
	) {
		this.timer = setInterval(() => this._update(), intervalInMs);
	}
	
	public close(): void {
		clearInterval(this.timer);
	}
}