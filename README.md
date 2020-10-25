# Wobserver WebRTC Extractor
Extractor Development Toolkits for WebRTC Samples


# Build library locally

- ### Install dependencies
  - Make sure we have type script installed in the system
    - npm install -g typescript`
  - Install package dependencies 
    - `npm ci`
  - Build the library
    - `npm run build-library-dev` ( developer version )
    - `npm run build-library-prod` ( production version )

  Once build is complete it will create `observer.js` ( developer) or `observer.min.js` ( production ) library in the `dist` folder. 


- ### Publish the package

  - We are using github package manager to publish the library
  - Goto the `package.json` and update the version
  - Login to GitHub package registry using your credentials
    - ​    `npm login --registry=https://npm.pkg.github.com`
  - Publish the package
    - `npm run publish-npm-library`

### Install core library package from package registry and user it in custom integration(s)
``
- Add the package in your package.json
  - `"@observertc/observer-lib": "0.3.1"`
- Create `.npmrc` in the project folder and add our registry
  - `@observertc:registry=https://npm.pkg.github.com/`
- Install the package
  - `npm install`

### You can just use the latest version of the library from GitHub directly in your HTML/JavaScript

- Developer version

```html
<script src="https://observertc.github.io/webextrapp/dist/observer.js"></script>
```

- Production version

```html
<script src="https://observertc.github.io/webextrapp/dist/observer.min.js"></script>
```

 ## Run demo using docker

  - Goto `example-demo` folder from `__test__`
   - `cd __test__/example-demo`
  - Install npm dependency
   - `npm install`
  - Run the demo
   - `npm run start-server` and access the server from http://localhost:9090


 ##### Change websocket server address in the demo application

  - Goto [integration.js](__test__/example-demo/js/integration.js#L24) and change server address
  - Change the current websocket server address
  - Run the demo
    - `npm run start-server` and access the server from http://localhost:9090
