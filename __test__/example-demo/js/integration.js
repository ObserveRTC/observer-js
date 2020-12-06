class Integrator {
    constructor(websocketServer = '') {
        this.init()
    }
    init(poolingInterval = 1000) {
        this.observer = new ObserverRTC.Builder()
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
window.integrator = new Integrator(wsServerURL);
