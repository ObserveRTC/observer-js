#!/bin/zsh
function build_observer_docker() {
    docker build --no-cache -t observer-js-demo .
}

function run_observer_docker() {
    docker run -it --rm \
    -p 9090:9090 \
    -e __PORT__='9090' \
    -e __OBSERVER_JS__='https://observertc.github.io/observer-js/dist/latest/observer.js' \
    -e __OBSERVER_MARKER__='SAMPLE-OBSERVER-MARKER' \
    -e __OBSERVER_BROWSER_ID__='SAMPLE-SAMPLE-BROWSER-ID' \
    -e __OBSERVER_ACCESS_TOKEN__='SAMPLE-JWT-ACCESS-TOKEN' \
    -e __OBSERVER_SERVER_ENDPOINT__='ws://localhost:9090/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json' \
    --name observer-js-demo observertc/observer-js-demo:latest
}
