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
        'participants': [],
    }
    return redirect(url_for('session', session_code=session_code))

@app.route('/session/<session_code>', methods=['GET', 'POST'])
def session(session_code):
    if session_code not in wheel_sessions:
        return redirect(url_for('index'))
    
    session_data = wheel_sessions[session_code]
    
    if request.method == 'POST':
        user_name = request.form['user_name']
        session_data['participants'].append(user_name)
    
    qr_code_url = f"{request.base_url}/join?session_code={session_code}"
    qr_code_image = qrcode.make(qr_code_url)

    img_io = BytesIO()
    qr_code_image.save(img_io, 'PNG')
    img_io.seek(0)
    qr_code_base64 = base64.b64encode(img_io.read()).decode('utf-8')
    
    return render_template('session.html', session_code=session_code, qr_code=qr_code_base64, participants=session_data['participants'])

@app.route('/join', methods=['GET', 'POST'])
def join():
    session_code = request.args.get('session_code')
    user_name = request.form.get('user_name')

    if session_code in wheel_sessions and user_name:
        session_data = wheel_sessions[session_code]
        session_data['participants'].append(user_name)
        return redirect(url_for('session', session_code=session_code))

    return redirect(url_for('index'))

@socketio.on('join_room')
def on_join(data):
    session_code = data['session_code']
    user_name = data['user_name']
    join_room(session_code)
    emit('new_connection', {'user': user_name}, room=session_code)

@socketio.on('spin')
def spin(data):
    session_code = data['session_code']
    speed = data['speed']
    
    if session_code in wheel_sessions:
        session_data = wheel_sessions[session_code]
        random_participant = random.choice(session_data['participants'])
        emit('spin', {'random_participant': random_participant, 'speed': speed}, room=session_code)

@socketio.on('start_random_cycle')
def start_random_cycle(data):
    session_code = data['session_code']
    
    if session_code in wheel_sessions:
        session_data = wheel_sessions[session_code]
        stop_event = Event()
        
        def random_participant_cycle():
            while not stop_event.is_set():
                random_participant = random.choice(session_data['participants'])
                emit('random_participant_update', {'random_participant': random_participant}, room=session_code)
                socketio.sleep(random.randint(5, 15))  # Random interval

        threading.Thread(target=random_participant_cycle).start()

@socketio.on('winner_removed')
def winner_removed(data):
    session_code = data['session_code']
    emit('remove_winner', room=session_code)

@socketio.on('update_participants')
def update_participants(data):
    session_code = data['session_code']
    if session_code in wheel_sessions:
        session_data = wheel_sessions[session_code]
        emit('update_participants', {'participants': session_data['participants']}, room=session_code)

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=10000, debug=True)
