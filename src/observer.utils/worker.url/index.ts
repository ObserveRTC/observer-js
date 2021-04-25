/* eslint-disable */
class WorkerUrlManager {
    static getURL (): string {
        // @ts-ignore
        const observerLoadPath = [...document.getElementsByTagName('script')].map(item => item.src).find(item => item.includes(__libraryFileName__) )
        const retval = observerLoadPath?.split('/').slice(
            0,
            -1
        )??[]
        // @ts-ignore
        return [...retval, __workerLibraryFileName__].join('/')
    }
}

export {
    WorkerUrlManager
}
