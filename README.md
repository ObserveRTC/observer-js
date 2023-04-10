Server side component for monitoring WebRTC stack
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
});

```

The above example do as follows:
 1. create an observer to evaluate samples from clients and sfus
 2. create a client source object to accept client samples
 3. add an evaluator process to evaluate ended calls

## API documentation

https://observertc.org/docs/api/observer-js

## NPM package

https://www.npmjs.com/package/@observertc/observer-js


## Schemas

https://github.com/observertc/schemas


## Getting Involved

The repository is open for contributions.

## License

Apache-2.0
