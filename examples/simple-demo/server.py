import os
from flask import render_template, Flask

app = Flask(__name__, template_folder='templates', static_folder='static')
observerjs = os.environ.get('__OBSERVER_JS__', 'https://observertc.github.io/observer-js/dist/latest/observer.js')
port = os.environ.get('__PORT__', '9099')
observer_marker = os.environ.get('__OBSERVER_MARKER__')
observer_browser_id = os.environ.get('__OBSERVER_BROWSER_ID__')
observer_server_endpoint = os.environ.get('__OBSERVER_SERVER_ENDPOINT__')
observer_access_token = os.environ.get('__OBSERVER_ACCESS_TOKEN__')


@app.route('/')
def index():
    return render_template('index.html',
                           __observerjs__=observerjs,
                           __observer_marker__=observer_marker,
                           __observer_browser_id__=observer_browser_id,
                           __observer_server_endpoint__=observer_server_endpoint,
                           __observer_access_token__=observer_access_token)


@app.route('/token')
def redirect_url():
    return 'success'


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port)
