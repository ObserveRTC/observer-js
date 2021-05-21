#!/bin/zsh
function build_observer_docker() {
    docker build --no-cache -t observer-js-demo .
}

function run_observer_docker() {
    docker run -it --rm \
    -p 9090:9090 \
    -e __PORT__='9090' \
    -e __OBSERVER_JS__='http://localhost:9091/v2105-21/observer.js' \
    -e __OBSERVER_MARKER__='SAMPLE-OBSERVER-MARKER' \
    -e __OBSERVER_BROWSER_ID__='SAMPLE-SAMPLE-BROWSER-ID' \
    -e __OBSERVER_SERVER_ENDPOINT__='ws://localhost:7080/pcsamples/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/' \
    --name observer-js-demo observer-js-demo
}
