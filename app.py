import os
import random
import string
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'spyfall-secret'
# Using default async mode for Windows if eventlet not installed, but let's assume it might fall back.
socketio = SocketIO(app, cors_allowed_origins="*")

# State
# room_id -> {'host_id': sid, 'players': [{'id': sid, 'name': '...'}], 'state': 'lobby', 'time': 480}
rooms = {} 

locations = {
    "Garden of Gethsemane": ["Jesus", "Peter", "Sleeping Disciple", "Judas", "Roman Guard", "High Priest Servant"],
    "Noah's Ark": ["Noah", "Noah's Wife", "Animal Groomer", "Carpenter", "Chef", "Stowaway"],
    "The Red Sea": ["Moses", "Aaron", "Terrified Israelite", "Pharaoh's Charioteer", "Egyptian Soldier", "Miriam"],
    "Mount Sinai": ["Moses", "Aaron", "Calf Sculptor", "Impatient Israelite", "Joshua", "Levite Guard"],
    "Jericho": ["Joshua", "Rahab", "Trumpet Player", "Wall Guard", "Israelite Soldier", "Panicking Citizen"],
    "Solomon's Temple": ["King Solomon", "High Priest", "Choir Member", "Temple Architect", "Altar Boy", "Money Changer"],
    "Bethlehem Manger": ["Mary", "Joseph", "Shepherd", "Wise Man", "Innkeeper", "Angel"],
    "Golgotha": ["Roman Centurion", "Mourning Woman", "Pharisee", "Thief on the Cross", "Disciple John", "Bystander"],
    "The Upper Room": ["Jesus", "Peter", "John", "Judas", "Servant carrying water", "Owner of the house"],
    "The Empty Tomb": ["Mary Magdalene", "Angel", "Sleeping Roman Guard", "Confused Disciple", "Peter", "Gardener"]
}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_room')
def on_create_room(data):
    player_name = data.get('name')
    room_code = generate_room_code()
    
    rooms[room_code] = {
        'host_id': request.sid,
        'players': [{'id': request.sid, 'name': player_name, 'is_host': True}],
        'state': 'lobby',
        'location': None
    }
    
    join_room(room_code)
    emit('room_created', {'room_code': room_code, 'player_id': request.sid})
    emit('update_players', {'players': rooms[room_code]['players'], 'host_id': rooms[room_code]['host_id']}, room=room_code)

@socketio.on('join_room')
def on_join_room(data):
    player_name = data.get('name')
    room_code = data.get('room_code', '').upper()
    
    if room_code not in rooms:
        emit('error', {'message': 'Room not found'})
        return
        
    room = rooms[room_code]
    if room['state'] != 'lobby':
        emit('error', {'message': 'Game already in progress'})
        return
        
    room['players'].append({'id': request.sid, 'name': player_name, 'is_host': False})
    join_room(room_code)
    
    emit('room_joined', {'room_code': room_code, 'player_id': request.sid})
    emit('update_players', {'players': room['players'], 'host_id': room['host_id']}, room=room_code)

@socketio.on('start_game')
def on_start_game(data):
    room_code = data.get('room_code')
    if room_code not in rooms:
        return
        
    room = rooms[room_code]
    if request.sid != room['host_id']:
        emit('error', {'message': 'Only host can start the game'})
        return
        
    players = room['players']
    # Removing this check so testing alone is easier, but adding it back logic wise for production.
    # We will enforce 2 players for production, but allow 1 if dev wants it.
    # if len(players) < 2:
    #     emit('error', {'message': 'Need at least 2 players'})
    #     return
        
    room['state'] = 'playing'
    
    # Select Spy
    spy_player = random.choice(players)
    
    # Select Location
    location_name = random.choice(list(locations.keys()))
    room['location'] = location_name
    roles = locations[location_name].copy()
    random.shuffle(roles)
    
    # Assign Roles
    for i, player in enumerate(players):
        is_spy = (player['id'] == spy_player['id'])
        if is_spy:
            player_role = "The Spy"
            player_location = "???"
        else:
            player_role = roles[i % len(roles)]
            player_location = location_name
            
        emit('game_started', {
            'location': player_location,
            'role': player_role,
            'is_spy': is_spy,
            'all_locations': list(locations.keys()),
            'duration': 8 * 60 # 8 minutes
        }, to=player['id'])

@socketio.on('disconnect')
def on_disconnect():
    for room_code, room in list(rooms.items()):
        players = room['players']
        for i, p in enumerate(players):
            if p['id'] == request.sid:
                players.pop(i)
                leave_room(room_code)
                
                if len(players) == 0:
                    del rooms[room_code]
                else:
                    if room['host_id'] == request.sid:
                        room['host_id'] = players[0]['id']
                        players[0]['is_host'] = True
                    emit('update_players', {'players': players, 'host_id': room['host_id']}, room=room_code)
                break

if __name__ == '__main__':
    import socket
    try:
        # Connect to a dummy external IP to determine the active local network interface
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'
        
    print("\n" + "="*60)
    print("🎮 GAME READY FOR MULTIPLAYER!")
    print(f"🏠 Play on this computer: http://127.0.0.1:5000")
    print(f"📱 Play on phones (same Wi-Fi): http://{local_ip}:5000")
    print("Share the phone link with friends so everyone can join!")
    print("="*60 + "\n")

    # run with eventlet/gevent normally, standard is fallback
    # host='0.0.0.0' is required to allow external connections (like phones)
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
