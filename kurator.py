import json
from bson.json_util import dumps
import os
from flask import Flask, send_from_directory, jsonify, request
from contrib.configparser import ConfigParser
from contrib.db import DB

# Read in config from file / environment variables
cfg = ConfigParser('config.toml').loadConfig()


# Initialize Flask with some config
app             = Flask(__name__)
app.debug       = cfg['webapp_settings']['debug_mode']
app.secret_key  = cfg['webapp_settings']['secret_key']
app.env         = cfg['webapp_settings']['environment']

DATABASE = cfg['data_sources']['db_path']

# Add CORS headers to allow access from React frontend
@app.after_request
def add_cors_headers(response):

    whiteList = cfg['webapp_settings']['cors_whitelist']

    response.headers.add('Access-Control-Allow-Origin', whiteList)
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Headers', 'Cache-Control')
    response.headers.add('Access-Control-Allow-Headers', 'X-Requested-With')
    response.headers.add('Access-Control-Allow-Headers', 'Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')

    return response

# Allow trailing slashes in routes
app.url_map.strict_slashes = False
@app.before_request
def clear_trailing():
    from flask import redirect, request

    rp = request.path 
    if rp != '/' and rp.endswith('/'):
        return redirect(rp[:-1])


@app.route('/')
def apiRoot():
    appName = {
        "app": app,
        "environment": app.env
    }
    return jsonify(appName)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/api/v1/collection', methods=['GET'])
def get_collection():

    args       = request.args
    mongo      = DB(db_path=DATABASE)
    collection = mongo.get_collection()

    query_dict = {}
    if args is not None:
        for k, v in args.items():
            query_dict.update({k.upper(): v})

        query        = collection.find(query_dict)
        query_list   = list(query)
        bson         = json.loads(dumps(query_list))

        return jsonify(bson)
    else:
        query        = collection.find()
        query_list   = list(query)
        bson         = json.loads(dumps(query_list))

        return jsonify(bson)

if __name__ == '__main__':
    app.run(
        host=cfg['webapp_settings']['host'],
        port=cfg['webapp_settings']['port']
    )