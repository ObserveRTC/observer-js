Server side component for monitoring WebRTC applications and services
---

Table of Contents:

 * [Quick Start](#quick-start)
 * [Configurations](#configurations)
 * [NPM package](#npm-package)
 * [Schemas](#schemas)
 * [License](#license)

## Qucik Start

Install it from [npm](https://www.npmjs.com/package/@observertc/observer-js) package repository.

```
npm i @observertc/observer-js
```

Use it in your server side NodeJS app. 

```javascript
import { createObserver, ClientSample } from "@observertc/observer-js";

const observer = createObserver({
    defaultServiceId: 'my-service-name',
    defaultMediaUnitId: 'my-reporting-component',
});

const observedCall = observer.createObservedCall({
    roomId: 'roomId',
    callId: 'room-session-id',
});

const observedClient = observedCall.createObservedClient({
    clientId: 'client-id',
    mediaUnitId: 'media-unit-id',
});

const clientSample: ClientSample; // Receive your samples, for example, from a WebSocket

observedClient.accept(clientSample);
```

The above example do as follows:
 1. create an observer to evaluate samples from clients and sfus
 2. create a client source object to accept client samples
 3. add an evaluator process to evaluate ended calls

 ### Get a Summary of a call when it ends

 ```javascript

 const monitor = observer.createCallSummaryMonitor('summary', (summary) => {
     console.log('Call Summary', summary);
 });
 ```

 ### How Many Clients are using TURN?

```javascript
const monitor = observer.createTurnUsageMonitor('turn', (turn) => {
    console.log('TURN', turn);
});

// at any point of time you can get the current state of the turn usage

console.log('Currently ', monitor.clients.size, 'clients are using TURN');

// you can get the incoming and outgoing bytes of the TURN server
console.log(`${YOUR_TURN_SERVER_ADDRESS} usage:`, monitor.getUsage(YOUR_TURN_SERVER_ADDRESS));

```

### Monitor Calls and Clients as they updated

```javascript
observer.on('newcall', (call) => {
    call.on('update', () => {
        console.log('Call Updated', call.callId);
    });

    call.on('newclient', (client) => {

        client.on('update', () => {
            console.log('Client Updated', client.clientId);

            console.log(`The avaialble incoming bitrate for the client ${client.clientId} is: ${client.availableIncomingBitrate}`)
        });
    })
});
```

## NPM package

https://www.npmjs.com/package/@observertc/observer-js


## Schemas

https://github.com/observertc/schemas


## License

Apache-2.0
