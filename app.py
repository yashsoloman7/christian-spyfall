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
    if len(players) < 3:
        emit('error', {'message': 'Need at least 3 players'})
        return
        
    room['state'] = 'playing'
    
    # Select Spy
    spy_player = random.choice(players)
    room['spy_id'] = spy_player['id']
    room['votes'] = {}
    
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
            
        game_duration = data.get('duration', 8 * 60)
        emit('game_started', {
            'location': player_location,
            'role': player_role,
            'is_spy': is_spy,
            'all_locations': list(locations.keys()),
            'duration': game_duration
        }, to=player['id'])

@socketio.on('time_up')
def on_time_up(data):
    room_code = data.get('room_code')
    if room_code not in rooms: return
    room = rooms[room_code]
    if request.sid != room['host_id'] or room['state'] != 'playing': return
    
    room['state'] = 'voting'
    room['votes'] = {}
    
    emit('start_voting', {
        'players': [{'id': p['id'], 'name': p['name']} for p in room['players']]
    }, room=room_code)

def check_voting(room_code, room):
    if len(room['votes']) >= len(room['players']):
        tally = {}
        for v in room['votes'].values():
            tally[v] = tally.get(v, 0) + 1
            
        max_votes = max(tally.values())
        most_voted = [pid for pid, count in tally.items() if count == max_votes]
        
        spy_id = room['spy_id']
        spy_player = next((p for p in room['players'] if p['id'] == spy_id), None)
        spy_name = spy_player['name'] if spy_player else 'Unknown'
        
        if len(most_voted) == 1 and most_voted[0] == spy_id:
            # Spy caught
            room['state'] = 'spy_guessing'
            emit('spy_caught', {
                'spy_id': spy_id,
                'locations': list(locations.keys()),
                'spy_name': spy_name
            }, room=room_code)
        else:
            # Spy wins
            room['state'] = 'game_over'
            emit('game_over', {
                'winner': 'Spy',
                'reason': 'The Spy was not successfully voted out!',
                'spy_name': spy_name,
                'location': room['location']
            }, room=room_code)

@socketio.on('submit_vote')
def on_submit_vote(data):
    room_code = data.get('room_code')
    voted_for_id = data.get('voted_for_id')
    if room_code not in rooms: return
    room = rooms[room_code]
    if room['state'] != 'voting': return
    
    room['votes'][request.sid] = voted_for_id
    check_voting(room_code, room)

@socketio.on('guess_location')
def on_guess_location(data):
    room_code = data.get('room_code')
    location_guess = data.get('location')
    if room_code not in rooms: return
    room = rooms[room_code]
    if room['state'] != 'spy_guessing': return
    if request.sid != room['spy_id']: return
    
    room['state'] = 'game_over'
    actual_location = room['location']
    
    spy_player = next((p for p in room['players'] if p['id'] == room['spy_id']), None)
    spy_name = spy_player['name'] if spy_player else 'Unknown'
    
    if location_guess == actual_location:
        emit('game_over', {
            'winner': 'Spy',
            'reason': f'The Spy guessed the correct location: {actual_location}',
            'spy_name': spy_name,
            'location': actual_location
        }, room=room_code)
    else:
        emit('game_over', {
            'winner': 'Innocents',
            'reason': f'The Spy guessed incorrectly! Set location was: {actual_location}',
            'spy_name': spy_name,
            'location': actual_location
        }, room=room_code)

@socketio.on('return_to_lobby')
def on_return_to_lobby(data):
    room_code = data.get('room_code')
    if room_code not in rooms: return
    room = rooms[room_code]
    if request.sid != room['host_id']: return
    
    room['state'] = 'lobby'
    room['location'] = None
    room['spy_id'] = None
    room['votes'] = {}
    
    emit('back_to_lobby', {}, room=room_code)

@socketio.on('disconnect')
def on_disconnect():
    for room_code, room in list(rooms.items()):
        players = room['players']
        for i, p in enumerate(players):
            if p['id'] == request.sid:
                # If they already voted, remove their vote
                if request.sid in room.get('votes', {}):
                    del room['votes'][request.sid]
                
                players.pop(i)
                leave_room(room_code)
                
                if len(players) == 0:
                    del rooms[room_code]
                else:
                    if room['host_id'] == request.sid:
                        room['host_id'] = players[0]['id']
                        players[0]['is_host'] = True
                    emit('update_players', {'players': players, 'host_id': room['host_id']}, room=room_code)
                    
                    # If we are in voting phase, re-evaluate votes
                    if room['state'] == 'voting':
                        check_voting(room_code, room)
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
