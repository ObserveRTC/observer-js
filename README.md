# Wobserver WebRTC Extractor
Extractor Development Toolkits for WebRTC Samples


# Build library locally

- ### Install dependencies
  - Make sure we have type script installed in the system
    - npm install -g typescript`
  - Install package dependencies 
    - `npm ci`
  - Build the library
    - `npm run build` ( developer version )
    - `npm run build-dev` ( production version )

  Once build is complete it will create `observer.js` ( developer) or `observer.min.js` ( production ) library in the `dist` folder.


### You can just use the latest version of the library from GitHub directly in your HTML/JavaScript

  - Developer version

  ```html
  <script src="https://observertc.github.io/observer-js/dist/v0.5.0/observer.js"></script>
  ```

  - Production version

  ```html
  <script src="https://observertc.github.io/observer-js/dist/v0.5.0/observer.min.js"></script>
  ```


## Run demo using docker

  - Goto `example-demo` folder from `__test__`
   - `cd __test__/example-demo`
  - Install npm dependency
   - `npm install`
  - Run the demo
   - `npm run start-server` and access the server from http://localhost:9090


 ##### Change websocket server address in the demo application

  - Goto [integration.js](__test__/example-demo/js/integration.js#L20) and change server address
  - Change the current websocket server address
  - Run the demo
    - `npm run start-server` and access the server from http://localhost:9090
