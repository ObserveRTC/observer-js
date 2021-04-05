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


### You can just use the latest version of the library from GitHub directly in your HTML/JavaScript. You can either use specific version from available version list or can use the latest version. 
#### [Available version list](https://github.com/ObserveRTC/observer-js/tags)

  - Developer version

  ```html
  <script src="https://observertc.github.io/observer-js/dist/latest/observer.js"></script>
  ```

  - Production version

  ```html
  <script src="https://observertc.github.io/observer-js/dist/latest/observer.min.js"></script>
  ```


## Run demo 

 - Details - https://hub.docker.com/r/observertc/observer-js-demo
