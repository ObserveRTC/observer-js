const localTransport = {
    onObserverRTCSample: (sampleList) => {
        console.warn('peer connection samples', sampleList)
    }
}

class Integrator {

    constructor(websocketServer, poolingIntervalInMs) {
        this.init(websocketServer, poolingIntervalInMs)
    }

    init(websocketServer = '', poolingIntervalInMs) {
        const builder = new ObserverRTC
            .Builder({wsAddress: websocketServer, poolingIntervalInMs: poolingIntervalInMs})

        builder.withIntegration('General')
        //builder.withLocalTransport(localTransport) //enable it if we want to receive sample callback instead of sending them to server
        if(observer_marker && observer_marker !== 'None')
            builder.withMarker(observer_marker)
        if(observer_browser_id && observer_browser_id !== 'None')
            builder.withBrowserId(observer_browser_id)

        this.observer = builder.build()
    }

    updateMarker(marker) {
        this.observer.updateMarker(marker)
    }

    startCollection() {
        this.observer.addPC(pc1)
        this.observer.addPC(pc2)
    }

    stopCollection() {
        this.observer.dispose()
    }
}

if(!observer_server_endpoint){
    throw Error('Please set a observer server endpoint')
}
const wsServerURL = observer_server_endpoint
window.integrator = new Integrator(wsServerURL, 1000);
