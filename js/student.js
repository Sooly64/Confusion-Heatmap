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
const toastEl = document.getElementById('toast');

// UI Elements
const goodBtn = document.getElementById('goodBtn');
const confusedBtn = document.getElementById('confusedBtn');
const feedbackInput = document.getElementById('feedbackInput');
const sendFeedbackBtn = document.getElementById('sendFeedbackBtn');
const infoBtn = document.getElementById('infoBtn');
const infoPanel = document.getElementById('infoPanel');
const closeInfoBtn = document.getElementById('closeInfoBtn');

// State
let studentID = '';
let roomID = '';
let currentStatus = null;

// Initialize the application
function init() {
  // Get room ID from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  roomID = (urlParams.get('room') || 'default').trim();
  
  // Sanitize room ID - only allow letters, numbers, and hyphens/underscores
  roomID = roomID.replace(/[^\w-]/g, '');
  
  if (!roomID) {
    roomID = 'default';
  }
  
  console.log('Connecting to room:', roomID);

  // Initialize student ID
  initStudentId();
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize student status in Firebase
  initializeStudentStatus();
  
  // Show welcome message
  showToast('Connected to room: ' + roomID);
  
  // Set up real-time status updates
  setupStatusListener();
}

// Initialize student status in Firebase
function initializeStudentStatus() {
  if (!roomID || !studentID) return;
  
  // Set up presence tracking
  const presenceRef = db.ref(`rooms/${roomID}/presence/${studentID}`);
  
  // Set presence data
  presenceRef.set({
    status: 'online',
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    type: 'student',
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
  
  // Set initial response status
  const studentRef = db.ref(`rooms/${roomID}/responses/${studentID}`);
  
  studentRef.once('value', (snapshot) => {
    if (!snapshot.exists()) {
      studentRef.set({
        status: 'none',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        name: 'Student',
        hasFeedback: false
      });
    } else {
      // Update current status from existing data
      const data = snapshot.val();
      if (data && data.status) {
        currentStatus = data.status;
        updateButtonStates(currentStatus);
      }
    }
  });
}

// Set up real-time status updates
function setupStatusListener() {
  if (!roomID || !studentID) return;
  
  const studentRef = db.ref(`rooms/${roomID}/responses/${studentID}`);
  
  studentRef.on('value', (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data && data.status) {
        currentStatus = data.status;
        updateButtonStates(currentStatus);
      }
    }
  });
}

// Initialize or retrieve student ID
function initStudentId() {
  const params = new URLSearchParams(location.search);
  const sidParam = (params.get('sid') || '').trim();
  const forceNew = params.has('new');
  const sessionSid = sessionStorage.getItem('studentID') || '';
  
  if (sidParam) {
    studentID = sidParam;
    sessionStorage.setItem('studentID', studentID);
  } else if (sessionSid && !forceNew) {
    studentID = sessionSid;
  } else {
    studentID = 'student_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('studentID', studentID);
  }
  
  if (forceNew) {
    try {
      const np = new URLSearchParams(location.search);
      np.delete('new');
      const q = np.toString();
      const nextUrl = location.pathname + (q ? ('?' + q) : '');
      history.replaceState(null, '', nextUrl);
    } catch (_) {}
  }
}

// Set up all event listeners
function setupEventListeners() {
  // Status buttons
  goodBtn.addEventListener('click', () => {
    sendStatus('good');
    flash(goodBtn);
  });
  
  confusedBtn.addEventListener('click', () => {
    sendStatus('confused');
    flash(confusedBtn);
  });
  
  // Feedback input
  feedbackInput.addEventListener('input', () => {
    sendFeedbackBtn.disabled = !feedbackInput.value.trim();
  });
  
  // Send feedback button
  sendFeedbackBtn.addEventListener('click', sendFeedback);
  
  // Info panel toggle is now handled by document-level event delegation
  
  // Handle Enter key in feedback input
  feedbackInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (feedbackInput.value.trim()) {
        sendFeedback();
      }
    }
  });
}

// Toggle info panel visibility
function toggleInfoPanel(show) {
  console.log('toggleInfoPanel called with:', show);
  if (show) {
    infoPanel.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    // Add a class to make it visible (in case hidden attribute isn't enough)
    infoPanel.style.display = 'flex';
  } else {
    infoPanel.setAttribute('hidden', '');
    document.body.style.overflow = '';
    infoPanel.style.display = 'none';
  }
}

// Send status to Firebase
function sendStatus(status) {
  if (!roomID || !studentID) return;
  
  currentStatus = status;
  
  // Update the UI to show active state
  updateButtonStates(status);
  
  // Send to Firebase
  db.ref(`rooms/${roomID}/responses/${studentID}`).set({
    status: status,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    name: 'Student',
    hasFeedback: false
  });
  
  showToast(status === 'good' ? 'Sent: Got it!' : 'Sent: I\'m confused');
}

// Send feedback to Firebase
function sendFeedback() {
  const feedback = feedbackInput.value.trim();
  if (!feedback || !roomID || !studentID) return;
  
  // Create a unique ID for the feedback
  const feedbackId = `feedback_${Date.now()}`;
  
  // Send feedback to Firebase
  db.ref(`rooms/${roomID}/feedback/${feedbackId}`).set({
    text: feedback,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    status: currentStatus || 'none',
    studentId: studentID
  });
  
  // Update hasFeedback flag
  if (currentStatus) {
    db.ref(`rooms/${roomID}/responses/${studentID}/hasFeedback`).set(true);
  }
  
  // Clear the input and show feedback
  feedbackInput.value = '';
  sendFeedbackBtn.disabled = true;
  showToast('Feedback sent!');
}

// Update button states based on current status
function updateButtonStates(activeStatus) {
  // Reset all buttons
  goodBtn.classList.remove('active');
  confusedBtn.classList.remove('active');
  
  // Set active button
  if (activeStatus === 'good') {
    goodBtn.classList.add('active');
  } else if (activeStatus === 'confused') {
    confusedBtn.classList.add('active');
  }
}

// Flash animation for buttons
function flash(el) {
  el.style.transform = 'scale(0.95)';
  setTimeout(() => el.style.transform = '', 100);
}

// Show toast message
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast.tid);
  showToast.tid = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (!db) {
    console.error('Realtime Database not available.');
    showToast('Error: Database connection failed');
    return;
  }
  
  // Set up close button with event delegation
  document.addEventListener('click', (e) => {
    // Close when clicking the close button
    if (e.target === closeInfoBtn || e.target.closest('#closeInfoBtn')) {
      toggleInfoPanel(false);
      return;
    }
    
    // Close when clicking outside the content
    if (infoPanel && !infoPanel.hidden && e.target === infoPanel) {
      toggleInfoPanel(false);
    }
  });
  
  // Set up info button with event delegation
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleInfoPanel(true);
  });
  
  init();
});
