import sqlite3
from flask import Flask, g, render_template
from contrib.configparser import ConfigParser

# Read in config from file
cfg = ConfigParser('config.toml').tomlParser()


# Initialize Flask with some config
app             = Flask(__name__)
app.debug       = cfg['flask']['debug_mode']
app.secret_key  = cfg['flask']['secret_key']
app.env         = cfg['flask']['environment']
app.url_map.strict_slashes = False

DATABASE = cfg['data']['db_path']

# Allow trailing slashes in routes
@app.before_request
def clear_trailing():
    from flask import redirect, request

    rp = request.path 
    if rp != '/' and rp.endswith('/'):
        return redirect(rp[:-1])

# Set up database connection
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
    return db

# Disconnect from DB on app teardown
@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

@app.route('/')
def hello():
    return render_template('generic_message.html', message='Welcome to KURAT[OR]')

@app.route('/<list_type>')
def getFullList(list_type):

    db  = get_db()
    cur = db.cursor()

    with db:
        if list_type == 'collection':
            cur.execute("SELECT * FROM HAVE")
            result = cur.fetchall()
            return render_template('list_full.html', list_type=list_type, game_list=result)
        elif list_type == 'wishlist':
            cur.execute("SELECT * FROM WANT")
            result = cur.fetchall()
            return render_template('list_full.html', list_type=list_type, game_list=result)
        elif list_type == 'ordered':
            cur.execute("SELECT * FROM ORDERED")
            result = cur.fetchall()
            return render_template('list_full.html', list_type=list_type, game_list=result)
        else:
            return render_template('generic_message.html', message='ERROR')

@app.route('/<list_type>/<console>')
def getListByConsole(list_type, console):

    db  = get_db()
    cur = db.cursor()

    with db:
        if list_type == 'collection':
            cur.execute(f"SELECT * FROM HAVE WHERE PLATFORM = '{console}'")
            result = list(dict(cur.fetchall()).keys())
            return render_template('list.html', list_type=list_type, console=console, game_list=result)
        elif list_type == 'wishlist':
            cur.execute(f"SELECT * FROM WANT WHERE PLATFORM = '{console}'")
            result = list(dict(cur.fetchall()).keys())
            return render_template('list.html', list_type=list_type, console=console, game_list=result)
        elif list_type == 'ordered':
            cur.execute(f"SELECT * FROM ORDERED WHERE PLATFORM = '{console}'")
            result = list(dict(cur.fetchall()).keys())
            return render_template('list.html', list_type=list_type, console=console, game_list=result)
        else:
            return render_template('generic_message.html', message='ERROR')

if __name__ == '__main__':
    app.run(
        host=cfg['flask']['host'],
        port=cfg['flask']['port']
    )