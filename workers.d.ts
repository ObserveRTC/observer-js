declare module 'web-worker:*' {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const WorkerFactory: new () => Worker
    export default WorkerFactory
}
