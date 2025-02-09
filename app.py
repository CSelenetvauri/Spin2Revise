from flask import Flask, render_template, request, redirect, url_for, session, make_response
import uuid, base64, qrcode, random, threading
from threading import Event
from io import BytesIO
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.secret_key = 'mysecretkey123'
socketio = SocketIO(app, async_mode="gevent")

wheel_sessions = {}
last_random_participants = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create', methods=['POST'])
def create():
    items = request.form['items'].split('\n')
    session_code = str(uuid.uuid4())
    wheel_sessions[session_code] = {
        'items': items,
        'participants': []
    }
    return redirect(url_for('session', session_code=session_code))

@app.route('/session/<session_code>')
def session(session_code):
    if session_code not in wheel_sessions:
        return redirect(url_for('index'))
    return render_template('wheel.html', session_code=session_code)

@app.route('/join/<session_code>', methods=['POST'])
def join(session_code):
    user_name = request.form['name']
    if session_code in wheel_sessions:
        wheel_sessions[session_code]['participants'].append(user_name)
        return redirect(url_for('session', session_code=session_code))
    return redirect(url_for('index'))

@socketio.on('join_room')
def on_join(data):
    session_code = data['session_code']
    user_name = data['user_name']
    join_room(session_code)
    emit('new_connection', {'user_name': user_name, 'session_code': session_code}, room=session_code)

@socketio.on('spin')
def on_spin(data):
    session_code = data['session_code']
    speed = data['speed']
    emit('spin', {'speed': speed, 'session_code': session_code}, room=session_code)

@socketio.on('start_random_cycle')
def start_random_cycle(data):
    session_code = data['session_code']
    stop_event = Event()

    def random_participant_cycle():
        while not stop_event.is_set():
            participants = wheel_sessions[session_code]['participants']
            if len(participants) > 0:
                random_participant = random.choice(participants)
                emit('random_participant_update', {'random_participant': random_participant}, room=session_code)
                threading.Event().wait(random.randint(5, 20))

    threading.Thread(target=random_participant_cycle).start()

@socketio.on('winner_removed')
def winner_removed(data):
    session_code = data['session_code']
    emit('remove_winner', {'session_code': session_code}, room=session_code)

@socketio.on('update_participants')
def update_participants(data):
    session_code = data['session_code']
    participants = wheel_sessions[session_code]['participants']
    emit('update_participants', {'participants': participants}, room=session_code)

if __name__ == '__main__':
    socketio.run(app, debug=True)
