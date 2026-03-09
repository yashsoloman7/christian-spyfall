const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Game State ─────────────────────────────────────────────────────────────
// rooms: { [roomCode]: { host_id, players: [{id, name, is_host}], state, location, spy_id, votes } }
const rooms = {};

const locations = {
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
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function checkVoting(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (Object.keys(room.votes).length >= room.players.length) {
        // Tally votes
        const tally = {};
        for (const votedId of Object.values(room.votes)) {
            tally[votedId] = (tally[votedId] || 0) + 1;
        }

        const maxVotes = Math.max(...Object.values(tally));
        const mostVoted = Object.keys(tally).filter(pid => tally[pid] === maxVotes);

        const spyPlayer = room.players.find(p => p.id === room.spy_id);
        const spyName = spyPlayer ? spyPlayer.name : 'Unknown';

        if (mostVoted.length === 1 && mostVoted[0] === room.spy_id) {
            // Spy caught
            room.state = 'spy_guessing';
            io.to(roomCode).emit('spy_caught', {
                spy_id: room.spy_id,
                locations: Object.keys(locations),
                spy_name: spyName
            });
        } else {
            // Spy wins
            room.state = 'game_over';
            io.to(roomCode).emit('game_over', {
                winner: 'Spy',
                reason: 'The Spy was not successfully voted out!',
                spy_name: spyName,
                location: room.location
            });
        }
    }
}

// ─── Socket.IO Events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {

    // CREATE ROOM
    socket.on('create_room', (data) => {
        const playerName = data.name;
        let roomCode = generateRoomCode();
        // Ensure unique code
        while (rooms[roomCode]) roomCode = generateRoomCode();

        rooms[roomCode] = {
            host_id: socket.id,
            players: [{ id: socket.id, name: playerName, is_host: true }],
            state: 'lobby',
            location: null,
            spy_id: null,
            votes: {}
        };

        socket.join(roomCode);
        socket.emit('room_created', { room_code: roomCode, player_id: socket.id });
        io.to(roomCode).emit('update_players', {
            players: rooms[roomCode].players,
            host_id: rooms[roomCode].host_id
        });
    });

    // JOIN ROOM
    socket.on('join_room', (data) => {
        const playerName = data.name;
        const roomCode = (data.room_code || '').toUpperCase();

        if (!rooms[roomCode]) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const room = rooms[roomCode];
        if (room.state !== 'lobby') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        room.players.push({ id: socket.id, name: playerName, is_host: false });
        socket.join(roomCode);

        socket.emit('room_joined', { room_code: roomCode, player_id: socket.id });
        io.to(roomCode).emit('update_players', {
            players: room.players,
            host_id: room.host_id
        });
    });

    // START GAME
    socket.on('start_game', (data) => {
        const roomCode = data.room_code;
        if (!rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (socket.id !== room.host_id) {
            socket.emit('error', { message: 'Only host can start the game' });
            return;
        }

        const players = room.players;
        if (players.length < 3) {
            socket.emit('error', { message: 'Need at least 3 players' });
            return;
        }

        room.state = 'playing';

        // Select Spy
        const spyPlayer = players[Math.floor(Math.random() * players.length)];
        room.spy_id = spyPlayer.id;
        room.votes = {};

        // Select Location
        const locationKeys = Object.keys(locations);
        const locationName = locationKeys[Math.floor(Math.random() * locationKeys.length)];
        room.location = locationName;
        const roles = [...locations[locationName]].sort(() => Math.random() - 0.5);

        const gameDuration = data.duration || 8 * 60;

        // Assign Roles
        players.forEach((player, i) => {
            const isSpy = player.id === spyPlayer.id;
            const playerRole = isSpy ? 'The Spy' : roles[i % roles.length];
            const playerLocation = isSpy ? '???' : locationName;

            io.to(player.id).emit('game_started', {
                location: playerLocation,
                role: playerRole,
                is_spy: isSpy,
                all_locations: locationKeys,
                duration: gameDuration
            });
        });
    });

    // TIME UP
    socket.on('time_up', (data) => {
        const roomCode = data.room_code;
        if (!rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (socket.id !== room.host_id || room.state !== 'playing') return;

        room.state = 'voting';
        room.votes = {};

        io.to(roomCode).emit('start_voting', {
            players: room.players.map(p => ({ id: p.id, name: p.name }))
        });
    });

    // SUBMIT VOTE
    socket.on('submit_vote', (data) => {
        const roomCode = data.room_code;
        const votedForId = data.voted_for_id;
        if (!rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (room.state !== 'voting') return;

        room.votes[socket.id] = votedForId;
        checkVoting(roomCode);
    });

    // GUESS LOCATION (Spy)
    socket.on('guess_location', (data) => {
        const roomCode = data.room_code;
        const locationGuess = data.location;
        if (!rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (room.state !== 'spy_guessing') return;
        if (socket.id !== room.spy_id) return;

        room.state = 'game_over';
        const actualLocation = room.location;

        const spyPlayer = room.players.find(p => p.id === room.spy_id);
        const spyName = spyPlayer ? spyPlayer.name : 'Unknown';

        if (locationGuess === actualLocation) {
            io.to(roomCode).emit('game_over', {
                winner: 'Spy',
                reason: `The Spy guessed the correct location: ${actualLocation}`,
                spy_name: spyName,
                location: actualLocation
            });
        } else {
            io.to(roomCode).emit('game_over', {
                winner: 'Innocents',
                reason: `The Spy guessed incorrectly! The actual location was: ${actualLocation}`,
                spy_name: spyName,
                location: actualLocation
            });
        }
    });

    // RETURN TO LOBBY
    socket.on('return_to_lobby', (data) => {
        const roomCode = data.room_code;
        if (!rooms[roomCode]) return;

        const room = rooms[roomCode];
        if (socket.id !== room.host_id) return;

        room.state = 'lobby';
        room.location = null;
        room.spy_id = null;
        room.votes = {};

        io.to(roomCode).emit('back_to_lobby', {});
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) continue;

            // Remove vote if in voting
            if (room.votes && room.votes[socket.id]) {
                delete room.votes[socket.id];
            }

            room.players.splice(idx, 1);
            socket.leave(roomCode);

            if (room.players.length === 0) {
                delete rooms[roomCode];
            } else {
                // Reassign host if needed
                if (room.host_id === socket.id) {
                    room.host_id = room.players[0].id;
                    room.players[0].is_host = true;
                }
                io.to(roomCode).emit('update_players', {
                    players: room.players,
                    host_id: room.host_id
                });

                // Re-evaluate votes if in voting
                if (room.state === 'voting') {
                    checkVoting(roomCode);
                }
            }
            break;
        }
    });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎮 CHRISTIAN SPYFALL - GAME READY!');
    console.log(`🏠 Play locally:        http://localhost:${PORT}`);
    console.log(`☁️  Set PORT env var to change port`);
    console.log('='.repeat(60) + '\n');
});
