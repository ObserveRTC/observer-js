class Integrator {
    constructor(websocketServer, poolingIntervalInMs) {
        this.init(websocketServer, poolingIntervalInMs)
    }
    init(websocketServer = '', poolingIntervalInMs) {
        this.observer = new ObserverRTC
            .Builder({wsAddress: websocketServer, poolingIntervalInMs: poolingIntervalInMs})
            .withIntegration('General')
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

const wsServerURL = 'ws://localhost:7080/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
window.integrator = new Integrator(wsServerURL, 1000);
