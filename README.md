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


- ### Publish the package

  - We are using github package manager to publish the library
  - Goto the `package.json` and update the version
  - Login to GitHub package registry using your credentials
    - ​    `npm login --registry=https://npm.pkg.github.com`
  - Publish the build `webextrapp-lib.js` package
    - `npm publish`



## Use the library for jitsi

1. Change the configuration file JSON from [library.config/index.json](library.config/index.json). A sample configuration file for Jitsi is given bellow

   ```json
   {
     "exportCallstats": true,
     "libraryName": "callstats",
     "poolingIntervalMs": 1000,
     "debug": false,
     "wsServer": {
       "URL": "wss://meet.cogint.ai:7879/ws/",
       "UUID": "86ed98c6-b001-48bb-b31e-da638b979c72"
     }
   }
   ```

2. Run `npm run build-library` to build the library. 

   - If the build is successful, it will generate the library inside `dist` folder.

3. You can now use the build library in Jitsi project that will collect stats from Jitsi conference and send stats to provided `wsServer` endpoint



### Install core library package from package registry and user it in custom integration(s)

- Add the package in your package.json
  - `"@observertc/webextrapp-lib": "0.1.0"`
- Create `.npmrc` in the project folder and add our registry
  - `@observertc:registry=https://npm.pkg.github.com/`
- Install the package
  - `npm install`

 ## Run demo using docker

  - Build and run the docker 
  - `npm run local-docker-demo` and access the server from http://localhost:9090


 ##### Change websocket server address in the demo application

  - Goto [integration.js](__test__/pc1/js/integration.js#L24) and change server address
  - Change the current websocket server address
  - Rebuild docker and run the test demo app again
    - `npm run local-docker-demo` and access the server from http://localhost:9090
