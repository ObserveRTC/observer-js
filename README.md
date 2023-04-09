Server side component for WebRTC monitoring
---

Table of Contents:

 * [Quick Start](#quick-start)
 * [Configurations](#configurations)
 * [NPM package](#npm-package)
 * [API docs](#api-docs)
 * [Schemas](#schemas)
 * [Getting Involved](#getting-involved)
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
    // see full config in Configuration section
});

const clientSource = observer.createClientSource({
    roomId: 'roomId',
    callId: 'room-session-id',
    clientId: 'reporting-client-id',
});

const clientSample: ClientSample; // Receive your samples, for example, from a WebSocket

clientSource.accept(clientSample);

observer.addEvaluator(async context => {
    const { endedCalls } = context;

    // Observe call durations
    for (const endedCall of endedCalls) {
        const elapsedTimeInMins = (endedCall.ended -  Number(endedCall.started)) / (60 * 1000);
        console.log(`Call ${endedCall.callId} duration was ${elapsedTimeInMins} minutes`);
    }
})
```

The above example do as follows:
 1. create a client monitor, which collect stats every 5s
 2. setup a stats collector from a peer connection
 3. register an event called after stats are collected
 4. print out the inbound rtps and then close the stats collector we registered in step 3.


## Configurations



## NPM package

https://www.npmjs.com/package/@observertc/observer-js


## Schemas

https://github.com/observertc/schemas


## Getting Involved

The repository is open for contributions.

## License

Apache-2.0
