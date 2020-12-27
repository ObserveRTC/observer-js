class Integrator {
    constructor(websocketServer, poolingIntervalInMs) {
        this.init(websocketServer, poolingIntervalInMs)
    }
    init(websocketServer = '', poolingIntervalInMs) {
        this.observer = new ObserverRTC.Builder({wsAddress: websocketServer, poolingIntervalInMs: poolingIntervalInMs})
            .build()
    }

    startCollection() {
        this.observer.addPC(pc1)
        this.observer.addPC(pc2)
    }

    stopCollection() {
        this.observer.dispose()
    }
}

//const wsServerURL = 'wss://webrtc-bserver.org/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
const wsServerURL = 'wss://webrtc-observer.org/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
window.integrator = new Integrator(wsServerURL, 1000);
