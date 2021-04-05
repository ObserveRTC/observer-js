import os
from flask import render_template, Flask

app = Flask(__name__, template_folder='templates', static_folder='static')
observerjs = os.environ.get('__OBSERVER_JS__', 'https://observertc.github.io/observer-js/dist/latest/observer.js')
port = os.environ.get('__PORT__', '8080')


@app.route('/')
def index():
    return render_template('index.html', __observerjs__=observerjs)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port)