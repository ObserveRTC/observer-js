
export interface UserMediaCallback {
    onMediaError: (errName: string) => void;
}

class UserMediaHandler {
    public overrideUserMedia (userMediaCallback: UserMediaCallback): void {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        // eslint-disable-next-line @typescript-eslint/promise-function-async,@typescript-eslint/explicit-function-return-type,func-names
        const newGetUserMedia = function () {
            return origGetUserMedia.apply(
                navigator.mediaDevices,
                // @ts-expect-error ignore
                // eslint-disable-next-line prefer-rest-params
                arguments
            ).then(
                async (stream) => Promise.resolve(stream),
                async (err) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    userMediaCallback.onMediaError(err.name)
                    return Promise.reject(err)
                }
            )
        }
        navigator.mediaDevices.getUserMedia = newGetUserMedia.bind(navigator.mediaDevices)
    }
}

export {
    UserMediaHandler
}
