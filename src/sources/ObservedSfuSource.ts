import { SfuSample } from '@observertc/sample-schemas-js';

export type ObservedSfuSourceConfig<T extends Record<string, unknown> = Record<string, unknown>> = {
	readonly appData: T;
	readonly serviceId: string;
	readonly mediaUnitId: string;
	readonly sfuId: string;
	readonly joined: number;

	timeZoneId?: string;
};

export interface ObservedSfuSource<T extends Record<string, unknown> = Record<string, unknown>> extends ObservedSfuSourceConfig<T> {
	readonly closed: boolean;

	accept(...samples: SfuSample[]): void;

	close(): void;
}
