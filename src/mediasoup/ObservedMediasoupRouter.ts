import { Observer } from "../Observer";

export class ObservedMediasoupRouter<T extends Record<string, unknown> = Record<string, unknown>> {
    public readonly appData: T;
    public constructor(
        public readonly parent: Observer,
        appData?: T
    ) {
        this.appData = appData ?? {} as T;
    }
}

