# Wobserver WebRTC Extractor
Extractor Development Toolkits for WebRTC Samples


# Build library locally

- ### Install dependencies
  - Make sure we have type script installed in the system
    - npm install -g typescript`
  - Install package dependencies 
    - `npm ci`
  - Build the library 
    - `npm run build-library`

  Once build is complete it will create `webextrapp-lib.js` library in the `dist` folder. 

  - ***The library can now take two environment variables***

    - `LIBRARY_NAME`
    - `CALLSTATS`
    - `WEBSOCKET_URL`

  - ***And, the can be passed as during build time***

    - ```shell
      process.env.LIBRARY_NAME ( WebextraApp, or callstats )
      process.env.CALLSTATS ( true if we are using for callstats library )
      process.env.WEBSOCKET_URL
      ```

    - Or, from package.json

      - ```json
        "exportCallstats": true,
        "libraryName": "callstats",
        "websocketURL": "wss://meet.cogint.ai:7879/ws/86ed98c6-b001-48bb-b31e-da638b979c72",
        ```

- ### Publish the package

  - We are using github package manager to publish the library
  - Goto the `package.json` and update the version
  - Login to GitHub package registry using your credentials
    - ​    `npm login --registry=https://npm.pkg.github.com`
  - Publish the build `webextrapp-lib.js` package
    - `npm publish`



## Use the library in a project

- ### Install package

  - Add the package in your package.json
    - `"@observertc/webextrapp-lib": "0.0.3"`
  - Create `.npmrc` in the project folder and add our registry
    - `@observertc:registry=https://npm.pkg.github.com/`
  - Install the package
    - `npm install`

 ## Run demo using docker

  - Build and run the docker 
  - `npm run run-demo` and access the server from http://localhost:9090


 ##### Change websocket server address in the demo application

  - Goto /__test__/pc1/js/integration.js#L24
  - Change the current websocket server address
  - Rebuild docker and run the test demo app again
    - `npm run run-demo` and access the server from http://localhost:9090
