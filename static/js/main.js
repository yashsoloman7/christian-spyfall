const socket = io();

// State
let myRoomCode = null;
let myPlayerId = null;
let isHost = false;
let gameData = null;
let timerInterval = null;
let remainingTime = 0;

// Screens
const screens = {
    loading: document.getElementById('screen-loading'),
    home: document.getElementById('screen-home'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game')
};

// UI Elements
const els = {
    playerName: document.getElementById('player-name'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    homeError: document.getElementById('home-error'),
    lobbyRoomCode: document.getElementById('lobby-room-code'),
    playerList: document.getElementById('player-list'),
    playerCount: document.getElementById('player-count'),
    hostControls: document.getElementById('host-controls'),
    waitingMsg: document.getElementById('waiting-msg'),
    btnStart: document.getElementById('btn-start'),
    timer: document.getElementById('timer'),
    roleCardInner: document.getElementById('role-card-inner'),
    roleCardContainer: document.getElementById('role-card-container'),
    gameLocation: document.getElementById('game-location'),
    gameRole: document.getElementById('game-role'),
    locationReference: document.getElementById('location-reference'),
    btnLeave: document.getElementById('btn-leave')
};

// Helpers
function showScreen(screenName) {
    for (let key in screens) {
        screens[key].classList.add('hidden');
    }
    screens[screenName].classList.remove('hidden');
}

function showError(msg) {
    els.homeError.textContent = msg;
    els.homeError.classList.remove('hidden');
    setTimeout(() => {
        els.homeError.classList.add('hidden');
    }, 4000);
}

// Initial setup - Show logo, then home screen
setTimeout(() => {
    // Add fade out class to loading screen
    screens.loading.style.opacity = '0';
    setTimeout(() => {
        showScreen('home');
        screens.loading.style.opacity = '1'; // reset
    }, 500);
}, 2500);

// Input auto-uppercase for room code
els.roomCodeInput.addEventListener('input', function() {
    this.value = this.value.toUpperCase();
});

// Events
els.btnCreate.addEventListener('click', () => {
    const name = els.playerName.value.trim();
    if (!name) return showError("Please enter your name");
    
    // Save to localstorage for convenience
    localStorage.setItem('spyfall_name', name);
    
    socket.emit('create_room', { name });
});

els.btnJoin.addEventListener('click', () => {
    const name = els.playerName.value.trim();
    const code = els.roomCodeInput.value.trim();
    
    if (!name) return showError("Please enter your name");
    if (!code || code.length !== 4) return showError("Invalid room code");
    
    localStorage.setItem('spyfall_name', name);
    socket.emit('join_room', { name, room_code: code });
});

els.btnStart.addEventListener('click', () => {
    // Add a spin to button
    const icon = els.btnStart.querySelector('i') || document.createElement('i');
    icon.className = "fa-solid fa-spinner fa-spin mr-2";
    els.btnStart.prepend(icon);
    
    socket.emit('start_game', { room_code: myRoomCode });
});

els.btnLeave.addEventListener('click', () => {
    if(confirm("Are you sure you want to leave the game?")) {
        window.location.reload();
    }
});

// Role Card Toggle via Transform
function bindRoleCardEvents() {
    const downEvents = ['mousedown', 'touchstart'];
    const upEvents = ['mouseup', 'mouseleave', 'touchend', 'touchcancel'];
    
    downEvents.forEach(evt => {
        els.roleCardContainer.addEventListener(evt, (e) => {
            if(evt.includes('touch')) {} // Can prevent default if needed, but watch out for scrolling
            els.roleCardInner.classList.add('rotate-y-180-active');
        }, {passive: true});
    });
    
    upEvents.forEach(evt => {
        els.roleCardContainer.addEventListener(evt, (e) => {
            els.roleCardInner.classList.remove('rotate-y-180-active');
        }, {passive: true});
    });
    
    // Disable right click on the card
    els.roleCardContainer.addEventListener('contextmenu', e => e.preventDefault());
}

bindRoleCardEvents();


// Socket Events
socket.on('room_created', (data) => {
    myRoomCode = data.room_code;
    myPlayerId = data.player_id;
    isHost = true;
    els.lobbyRoomCode.textContent = myRoomCode;
    showScreen('lobby');
});

socket.on('room_joined', (data) => {
    myRoomCode = data.room_code;
    myPlayerId = data.player_id;
    isHost = false;
    els.lobbyRoomCode.textContent = myRoomCode;
    showScreen('lobby');
});

socket.on('error', (data) => {
    showError(data.message);
    const spin = els.btnStart.querySelector('.fa-spinner');
    if(spin) spin.remove();
});

socket.on('update_players', (data) => {
    els.playerList.innerHTML = '';
    
    if(data.host_id === myPlayerId) {
        isHost = true;
    }
    
    els.playerCount.textContent = `${data.players.length}`;
    
    data.players.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = "bg-gray-800 bg-opacity-60 p-4 rounded-xl flex justify-between items-center border border-gray-700 shadow-sm transition-all";
        li.style.animationDelay = `${index * 0.05}s`;
        li.classList.add('slide-in');
        
        const wrapper = document.createElement('div');
        wrapper.className = "flex items-center space-x-3";
        
        const avatar = document.createElement('div');
        avatar.className = "w-8 h-8 rounded-full bg-blue-900 border border-gold flex items-center justify-center text-xs font-bold text-gold";
        avatar.textContent = p.name.charAt(0).toUpperCase();
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name + (p.id === myPlayerId ? " (You)" : "");
        nameSpan.className = p.id === myPlayerId ? "font-bold text-white" : "text-gray-300";
        
        wrapper.appendChild(avatar);
        wrapper.appendChild(nameSpan);
        li.appendChild(wrapper);
        
        if (p.is_host) {
            const hostBadge = document.createElement('span');
            hostBadge.innerHTML = '<i class="fa-solid fa-crown mr-1"></i>Host';
            hostBadge.className = "text-xs bg-gradient-to-r from-yellow-600 to-yellow-700 text-white px-3 py-1 rounded-full font-bold shadow-sm";
            li.appendChild(hostBadge);
        }
        
        els.playerList.appendChild(li);
    });
    
    if (isHost) {
        els.hostControls.classList.remove('hidden');
        els.waitingMsg.classList.add('hidden');
    } else {
        els.hostControls.classList.add('hidden');
        els.waitingMsg.classList.remove('hidden');
    }
});

socket.on('game_started', (data) => {
    gameData = data;
    
    // Cleanup UI
    const spin = els.btnStart.querySelector('.fa-spinner');
    if(spin) spin.remove();
    els.roleCardInner.classList.remove('rotate-y-180-active'); // ensure it's hidden initially
    
    showScreen('game');
    
    if(data.is_spy) {
        els.gameLocation.textContent = "???";
        els.gameLocation.className = "text-3xl sm:text-4xl font-bold text-red-500 mb-6 leading-tight tracking-widest";
        els.gameRole.className = "text-2xl sm:text-3xl font-bold text-red-400";
    } else {
        els.gameLocation.textContent = data.location;
        els.gameLocation.className = "text-2xl sm:text-3xl font-bold text-gold mb-6 leading-tight";
        els.gameRole.className = "text-xl sm:text-2xl font-semibold text-white";
    }
    
    els.gameRole.textContent = data.role;
    
    // Populate locations
    els.locationReference.innerHTML = '';
    // Sort locations alphabetically
    const sortedLocations = [...data.all_locations].sort();
    
    sortedLocations.forEach(loc => {
        const li = document.createElement('li');
        li.className = "flex items-start space-x-2 py-1";
        li.innerHTML = `<i class="fa-solid fa-location-dot text-gray-600 mt-1 text-xs"></i> <span class="leading-tight">${loc}</span>`;
        els.locationReference.appendChild(li);
    });
    
    // Start timer
    startTimer(data.duration);
});

function startTimer(duration) {
    if (timerInterval) clearInterval(timerInterval);
    
    remainingTime = duration;
    updateTimerDisplay();
    els.timer.classList.remove('text-red-500', 'animate-pulse');
    els.timer.classList.add('text-gold');
    
    timerInterval = setInterval(() => {
        remainingTime--;
        updateTimerDisplay();
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            els.timer.textContent = "00:00";
            // Optional: Show time up overlay or alert
            setTimeout(() => alert("Time's Up!"), 100);
        }
    }, 1000);
}

function updateTimerDisplay() {
    if(remainingTime < 0) return;
    
    const m = Math.floor(remainingTime / 60).toString().padStart(2, '0');
    const s = (remainingTime % 60).toString().padStart(2, '0');
    els.timer.textContent = `${m}:${s}`;
    
    if (remainingTime === 60) {
        els.timer.classList.add('text-red-500', 'animate-pulse');
        els.timer.classList.remove('text-gold');
    }
}

// Restore name from local storage
const savedName = localStorage.getItem('spyfall_name');
if(savedName) {
    els.playerName.value = savedName;
}
