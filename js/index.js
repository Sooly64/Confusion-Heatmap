// Firebase Realtime Database instance
const db = window.firebaseDB;

// DOM Elements
const themeToggle = document.getElementById('themeToggle');
const createRoomBtn = document.getElementById('createRoomBtn');
const studentBtn = document.getElementById('studentBtn');
const createRoomModal = document.getElementById('createRoomModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const newRoomInput = document.getElementById('newRoomInput');
const confirmCreateBtn = document.getElementById('confirmCreateBtn');
const studentRoomModal = document.getElementById('studentRoomModal');
const closeStudentModalBtn = document.getElementById('closeStudentModalBtn');
const roomsList = document.getElementById('roomsList');

// Theme management
function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.checked = false;
    } else {
        // Light mode is default
        document.documentElement.removeAttribute('data-theme');
        themeToggle.checked = true;
    }
}

themeToggle.addEventListener('change', () => {
    const light = themeToggle.checked;
    if (light) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
});

// Room name sanitization
function sanitizeRoom(name) {
    return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'room1';
}

// Generate and store teacher token for room ownership
function generateTeacherToken(roomName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);
    const token = btoa(`${roomName}:${timestamp}:${random}`).replace(/[+/=]/g, '');
    return token;
}

function storeTeacherToken(roomName, token) {
    const tokens = JSON.parse(localStorage.getItem('teacherTokens') || '{}');
    tokens[roomName.toLowerCase()] = { token, timestamp: Date.now() };
    localStorage.setItem('teacherTokens', JSON.stringify(tokens));
}

// Validate room ownership and prevent duplicates
async function validateAndClaimRoom(roomName) {
    if (!db) return true;
    
    try {
        // Check for existing room with different case
        const snapshot = await db.ref('rooms').once('value');
        const rooms = snapshot.val();
        
        if (rooms) {
            const existingRoomNames = Object.keys(rooms);
            const conflictingRoom = existingRoomNames.find(name => 
                name.toLowerCase() === roomName.toLowerCase() && name !== roomName
            );
            
            if (conflictingRoom) {
                alert(`Room "${conflictingRoom}" already exists. Room names are case-insensitive.`);
                return false;
            }
            
            // Check if room already has an owner
            if (rooms[roomName] && rooms[roomName].owner) {
                const tokens = JSON.parse(localStorage.getItem('teacherTokens') || '{}');
                const localToken = tokens[roomName.toLowerCase()];
                if (!localToken || localToken.token !== rooms[roomName].owner.token) {
                    alert('This room is already owned by another teacher.');
                    return false;
                }
            }
        }
        
        // Generate and store token
        const token = generateTeacherToken(roomName);
        storeTeacherToken(roomName, token);
        
        // Claim room in Firebase
        await db.ref(`rooms/${roomName}/owner`).set({
            token: token,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        return true;
    } catch (error) {
        console.error('Error validating room:', error);
        alert('Error validating room ownership');
        return false;
    }
}

// Fetch and display available rooms
function fetchAndDisplayRooms() {
    if (!db) {
        roomsList.innerHTML = '<div class="error-rooms">Error: Unable to connect to database</div>';
        return;
    }

    db.ref('rooms').once('value', (snapshot) => {
        const rooms = snapshot.val();
        const roomElements = [];
        
        if (rooms) {
            Object.keys(rooms).forEach(roomName => {
                // Check if room has any activity (presence or responses)
                const roomData = rooms[roomName];
                const hasActivity = (roomData.presence && Object.keys(roomData.presence).length > 0) ||
                                  (roomData.responses && Object.keys(roomData.responses).length > 0);
                
                if (hasActivity) {
                    // Count current users (only students, not teachers)
                    let userCount = 0;
                    if (roomData.presence) {
                        Object.values(roomData.presence).forEach(presence => {
                            // Only count students, not teachers
                            if (presence.type === 'student') {
                                userCount++;
                            }
                        });
                    }
                    
                    roomElements.push({ name: roomName, userCount });
                }
            });
        }

        // Sort rooms alphabetically (case-insensitive)
        roomElements.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        // Display rooms
        if (roomElements.length > 0) {
            roomsList.innerHTML = '';
            roomElements.forEach(room => {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-item';
                const userText = room.userCount === 1 ? '1 Student In' : `${room.userCount} Students In`;
                roomEl.innerHTML = `
                    <div class="room-info">
                        <div class="room-name">${room.name.charAt(0).toUpperCase() + room.name.slice(1)}</div>
                        <div class="room-status">${userText}</div>
                    </div>
                    <button class="btn btn-secondary join-room-btn" data-room="${room.name}">Join</button>
                `;
                roomsList.appendChild(roomEl);
            });

            // Add event listeners to join buttons
            document.querySelectorAll('.join-room-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const roomName = btn.getAttribute('data-room');
                    window.location.href = `html/student.html?room=${encodeURIComponent(roomName)}`;
                });
            });
        } else {
            roomsList.innerHTML = '<div class="no-rooms">No active rooms available</div>';
        }
    }).catch((error) => {
        console.error('Error fetching rooms:', error);
        roomsList.innerHTML = '<div class="error-rooms">Error loading rooms</div>';
    });
}

// Create room functionality
createRoomBtn.addEventListener('click', () => {
    createRoomModal.style.display = 'flex';
    newRoomInput.focus();
});

closeModalBtn.addEventListener('click', () => {
    createRoomModal.style.display = 'none';
    newRoomInput.value = '';
});

confirmCreateBtn.addEventListener('click', async () => {
    const roomName = sanitizeRoom(newRoomInput.value);
    if (roomName) {
        // Validate and claim room ownership
        const isValid = await validateAndClaimRoom(roomName);
        if (!isValid) return;
        
        window.location.href = `html/teacher.html?room=${encodeURIComponent(roomName)}`;
    }
});

newRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        confirmCreateBtn.click();
    }
});

// Student modal functionality
studentBtn.addEventListener('click', () => {
    studentRoomModal.style.display = 'flex';
    fetchAndDisplayRooms();
});

closeStudentModalBtn.addEventListener('click', () => {
    studentRoomModal.style.display = 'none';
});

// Close modal when clicking outside
createRoomModal.addEventListener('click', (e) => {
    if (e.target === createRoomModal) {
        closeModalBtn.click();
    }
});

studentRoomModal.addEventListener('click', (e) => {
    if (e.target === studentRoomModal) {
        closeStudentModalBtn.click();
    }
});

// Clean up inactive rooms (older than 30 minutes)
function cleanupInactiveRooms() {
    if (!db) return;
    
    console.log('Running room cleanup...');
    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000);
    
    db.ref('rooms').once('value', (snapshot) => {
        const rooms = snapshot.val();
        if (!rooms) return;
        
        const roomsToDelete = [];
        
        Object.keys(rooms).forEach(roomName => {
            const roomData = rooms[roomName];
            
            // Check if room has any active presence
            let hasActivePresence = false;
            if (roomData.presence) {
                Object.values(roomData.presence).forEach(presence => {
                    if (presence.lastSeen && presence.lastSeen > thirtyMinutesAgo) {
                        hasActivePresence = true;
                    }
                });
            }
            
            // Also check if there are recent responses (within 30 minutes)
            let hasRecentActivity = false;
            if (roomData.responses) {
                Object.values(roomData.responses).forEach(response => {
                    if (response.timestamp && response.timestamp > thirtyMinutesAgo) {
                        hasRecentActivity = true;
                    }
                });
            }
            
            // If no active presence and no recent activity, mark for deletion
            if (!hasActivePresence && !hasRecentActivity) {
                roomsToDelete.push(roomName);
            }
        });
        
        // Delete inactive rooms
        roomsToDelete.forEach(roomName => {
            console.log('Deleting inactive room:', roomName);
            db.ref(`rooms/${roomName}`).remove();
        });
        
        if (roomsToDelete.length > 0) {
            console.log(`Cleaned up ${roomsToDelete.length} inactive rooms`);
            // Refresh room list if modal is open
            if (studentRoomModal.style.display === 'flex') {
                fetchAndDisplayRooms();
            }
        }
    }).catch((error) => {
        console.error('Error during room cleanup:', error);
    });
}

// Initialize theme on load
initTheme();

// Fetch available rooms on load
fetchAndDisplayRooms();

// Refresh rooms every 30 seconds
setInterval(fetchAndDisplayRooms, 30000);

// Clean up inactive rooms every 5 minutes
setInterval(cleanupInactiveRooms, 300000);

// Initial cleanup
setTimeout(cleanupInactiveRooms, 5000);
