(function(){
  'use strict';
  
  // Theme management - sync across pages
  function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      // Light mode is default
      document.documentElement.removeAttribute('data-theme');
    }
  }
  
  // Initialize theme on load
  initTheme();
  
  // Listen for storage changes to sync theme across pages
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
      initTheme();
    }
  });
  
  // Firebase Realtime Database instance
  const db = window.firebaseDB;

  // Determine the current room from the URL; no fallback here (overlay handles missing)
  const params = new URLSearchParams(location.search);
  const roomParam = (params.get('room') || '').trim();
  const roomOverlay = document.getElementById('roomOverlay');
  const roomInput = document.getElementById('roomInput');
  const roomSubmitBtn = document.getElementById('roomSubmitBtn');
  const mainApp = document.getElementById('mainApp');

  function sanitizeRoom(name) {
    return name.replace(/\s+/g,'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40) || 'room1';
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

  function isRoomOwner(roomName) {
    const tokens = JSON.parse(localStorage.getItem('teacherTokens') || '{}');
    const tokenData = tokens[roomName.toLowerCase()];
    return tokenData && tokenData.token;
  }

  // Validate room ownership and prevent duplicates
  async function validateAndClaimRoom(roomName) {
    console.log('Validating and claiming room:', roomName);
    if (!db) {
      console.log('No database connection, allowing room creation');
      return true;
    }
    
    try {
      console.log('Checking for existing rooms...');
      // Check for existing room with different case
      const snapshot = await db.ref('rooms').once('value');
      const rooms = snapshot.val();
      console.log('Existing rooms:', rooms);
      
      if (rooms) {
        const existingRoomNames = Object.keys(rooms);
        console.log('Existing room names:', existingRoomNames);
        
        const conflictingRoom = existingRoomNames.find(name => 
          name.toLowerCase() === roomName.toLowerCase() && name !== roomName
        );
        
        if (conflictingRoom) {
          console.log('Found conflicting room:', conflictingRoom);
          showToast(`Room "${conflictingRoom}" already exists. Room names are case-insensitive.`);
          return false;
        }
        
        // Check if room already has an owner
        if (rooms[roomName] && rooms[roomName].owner) {
          console.log('Room already has owner:', rooms[roomName].owner);
          const ownerToken = isRoomOwner(roomName);
          if (!ownerToken || ownerToken !== rooms[roomName].owner.token) {
            console.log('Room owned by someone else');
            showToast('This room is already owned by another teacher.');
            return false;
          } else {
            console.log('Room already owned by this user');
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
      
      console.log('Room claimed successfully');
      return true;
    } catch (error) {
      console.error('Error validating room:', error);
      showToast('Error validating room ownership');
      return false;
    }
  }

  if (!roomParam) {
    roomOverlay.style.display = 'flex';
    mainApp.style.display = 'none';
    setTimeout(() => roomInput && roomInput.focus(), 0);
  } else {
    roomOverlay.style.display = 'none';
    mainApp.style.display = '';
  }

  const submitRoom = async () => {
    const name = sanitizeRoom(roomInput.value);
    if (!name) return;
    
    // Validate and claim room ownership
    const isValid = await validateAndClaimRoom(name);
    if (!isValid) return;
    
    const np = new URLSearchParams(location.search);
    np.set('room', name);
    location.href = location.pathname + '?' + np.toString();
  };
  roomSubmitBtn && roomSubmitBtn.addEventListener('click', submitRoom);
  roomInput && roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitRoom();
  });

  const room = roomParam || null;
  
  // Validate room ownership when accessing via URL
  if (room) {
    console.log('Checking room access for:', room);
    const checkRoomAccess = async () => {
      if (!db) {
        console.log('No database connection');
        return;
      }
      
      try {
        console.log('Fetching owner data for room:', room);
        const ownerSnapshot = await db.ref(`rooms/${room}/owner`).once('value');
        const ownerData = ownerSnapshot.val();
        
        console.log('Owner data:', ownerData);
        
        if (ownerData && ownerData.token) {
          const localToken = isRoomOwner(room);
          
          if (!localToken || localToken !== ownerData.token) {
            showToast('Access denied: You do not own this room');
            setTimeout(() => {
              window.location.href = '../index.html';
            }, 2000);
            return;
          } else {
            // Access granted - tokens match
          }
        } else {
          console.log('Room exists but has no owner, claiming it');
          await validateAndClaimRoom(room);
        }
      } catch (error) {
        console.error('Error checking room access:', error);
      }
    };
    
    checkRoomAccess();
  }
  if (room) {
    // Reflect room in UI immediately
    document.getElementById('roomName').textContent = room;
    try { document.title = `Teacher — ${room}`; } catch (e) {}
    
    // Set up teacher presence tracking
    const teacherID = 'teacher_' + room.toLowerCase();
    const presenceRef = db.ref(`rooms/${room}/presence/${teacherID}`);
    
    // Set presence data
    presenceRef.set({
      status: 'online',
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      type: 'teacher',
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Set up disconnect cleanup
    presenceRef.onDisconnect().remove();
    
    // Update presence every minute to keep connection alive
    setInterval(() => {
      presenceRef.update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }, 60000);
  }

  // References scoped to the current room (guarded)
  let responsesRef = null;
  let presenceRef = null;
  if (db && room) {
    responsesRef = db.ref(`rooms/${room}/responses`);
    presenceRef = db.ref(`rooms/${room}/presence`);
  }

  /* DOM References */
  const goodCountSpan = document.getElementById('goodCount');
  const noVoteCountSpan = document.getElementById('noVoteCount');
  const confusedCountSpan = document.getElementById('confusedCount');
  const resetButton = document.getElementById('resetButton');
  const roomNameEl = document.getElementById('roomName');
  const qrEl = document.getElementById('qrcode');
  const barGoodEl = document.getElementById('barGood');
  const barNoVoteEl = document.getElementById('barNoVote');
  const barConfusedEl = document.getElementById('barConfused');
  const toastEl = document.getElementById('toast');

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast.tid);
    showToast.tid = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  // Initialize room display (may be null initially)
  roomNameEl.textContent = room || '';
  
  // Feedback elements
  const feedbackList = document.getElementById('feedbackList');
  let feedbackRef = null;
  
  // Function to format timestamp
  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Function to create a feedback element
  function createFeedbackElement(feedback) {
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'feedback-item';
    
    const statusClass = feedback.status === 'good' ? 'good' : (feedback.status === 'confused' ? 'bad' : '');
    const statusText = feedback.status === 'good' ? 'Got it' : (feedback.status === 'confused' ? 'Confused' : 'No status');
    
    feedbackEl.innerHTML = `
      <div class="feedback-header">
        <span class="feedback-time">${formatTime(feedback.timestamp)}</span>
        <span class="feedback-status ${statusClass}">${statusText}</span>
      </div>
      <div class="feedback-text">${feedback.text.replace(/\n/g, '<br>')}</div>
    `;
    
    return feedbackEl;
  }
  
  // Function to load feedback
  function loadFeedback() {
    if (!room || !db) return;
    
    // Clear existing feedback
    feedbackList.innerHTML = '';
    
    // Set up Firebase listener for feedback
    if (feedbackRef) {
      feedbackRef.off(); // Remove previous listener if any
    }
    
    feedbackRef = db.ref(`rooms/${room}/feedback`);
    feedbackRef.orderByChild('timestamp').limitToLast(20).on('value', (snapshot) => {
      const feedbacks = [];
      snapshot.forEach((childSnapshot) => {
        feedbacks.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      
      // Clear and update feedback list
      feedbackList.innerHTML = '';
      
      if (feedbacks.length === 0) {
        feedbackList.innerHTML = '<div class="no-feedback">No feedback yet</div>';
        return;
      }
      
      // Add feedback items in reverse order (newest first)
      feedbacks.reverse().forEach(feedback => {
        feedbackList.appendChild(createFeedbackElement(feedback));
      });
      
      // Auto-scroll to bottom
      feedbackList.scrollTop = feedbackList.scrollHeight;
    });
  }
      

  function nextRoomName(name) {
    name = String(name || 'room1');
    const m = name.match(/^(.*?)(\d+)$/);
    if (!m) return name + '2';
    const base = m[1];
    const numStr = m[2];
    const nextNum = (parseInt(numStr, 10) + 1).toString().padStart(numStr.length, '0');
    return base + nextNum;
  }

  function setQRText(text) {
    qrEl.innerHTML = '';
    try { new QRCode(qrEl, { text, width: 180, height: 180 }); } catch (e) {}
  }

  function buildStudentUrl(r) {
    return `${location.origin}/html/student.html?room=${encodeURIComponent(r)}&new=1`;
  }

  // Set QR for current room once and load feedback
  if (room) {
    try { 
      setQRText(buildStudentUrl(room));
      loadFeedback();
    } catch (e) {
      console.error('Error initializing room:', e);
    }
  }

  // No capacity/auto-advance controls

  // Cache snapshots to combine presence and responses
  let lastPresence = null;
  let lastResponses = null;

  function recomputeAndRender() {
    if (!room) return;
    let goodCount = 0;
    let confusedCount = 0;
    if (lastResponses) {
      for (const studentID in lastResponses) {
        const v = lastResponses[studentID];
        // Handle both old format (direct status) and new format (object with status)
        const status = (typeof v === 'object' && v.status) ? v.status : v;
        if (status === 'good') goodCount++;
        else if (status === 'confused') confusedCount++;
      }
    }
    // Count only students, not teachers
    let totalPresent = 0;
    if (lastPresence) {
      Object.values(lastPresence).forEach(presence => {
        if (presence.type === 'student') {
          totalPresent++;
        }
      });
    }
    const voted = goodCount + confusedCount;
    const noVote = Math.max(totalPresent - voted, 0);
    const denom = Math.max(totalPresent, 1);

    goodCountSpan.textContent = goodCount;
    confusedCountSpan.textContent = confusedCount;
    noVoteCountSpan.textContent = noVote;

    const goodPct = (goodCount / denom) * 100;
    const noVotePct = (noVote / denom) * 100;
    const confusedPct = (confusedCount / denom) * 100;
    barGoodEl.style.width = goodPct.toFixed(2) + '%';
    barNoVoteEl.style.width = noVotePct.toFixed(2) + '%';
    barConfusedEl.style.width = confusedPct.toFixed(2) + '%';

    // QR remains static for current room, no rerendering
  }

  if (!db) {
    console.error('Firebase DB not initialized.');
    showToast('Firebase not available');
  }

  try {
    room && presenceRef && presenceRef.on('value', (snap) => {
      lastPresence = snap.val();
      recomputeAndRender();
    }, (err) => { console.error('Presence read error:', err); });
  } catch (e) { console.error('Presence listener error:', e); }

  room && responsesRef && responsesRef.on('value', (snapshot) => {
    lastResponses = snapshot.val();
    recomputeAndRender();
  }, (error) => { console.error('Error reading data:', error); });

  resetButton.addEventListener('click', async () => {
    if (!room) { showToast('Select a room first'); return; }
    resetButton.disabled = true;
    try {
      // Clear both responses and feedback
      const updates = {};
      updates[`rooms/${room}/responses`] = null;
      updates[`rooms/${room}/feedback`] = null;
      
      await db.ref().update(updates);
      showToast('All responses and feedback cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
      showToast('Reset failed');
    } finally {
      resetButton.disabled = false;
    }
  });
})();
