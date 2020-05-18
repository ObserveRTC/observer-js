
export interface IWobserverPlugin {
    receiveStats(sample: any): void
    execute(): void
}
