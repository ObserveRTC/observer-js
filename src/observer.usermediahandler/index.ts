import Observer from '../observer.manager'

class UserMediaHandler {
    public overrideUserMedia(observer: Observer) {
        if (!navigator?.mediaDevices?.getUserMedia)return

        const origGetUserMedia = navigator?.mediaDevices?.getUserMedia.bind(navigator?.mediaDevices)
        // tslint:disable-next-line:only-arrow-functions
        const newGetUserMedia = function() {
            // @ts-ignore
            return origGetUserMedia.apply(navigator?.mediaDevices, arguments)
                // @ts-ignore
                // tslint:disable-next-line:only-arrow-functions
                .then(function(stream) {
                    return Promise.resolve(stream)
                    // @ts-ignore
                    // tslint:disable-next-line:only-arrow-functions
                }, function(err: UserMediaError) {
                    observer?.sendUserMediaError(err?.name)
                    return Promise.reject(err)
                })
        }
        navigator.mediaDevices.getUserMedia = newGetUserMedia.bind(navigator.mediaDevices)
    }
}

export default UserMediaHandler
