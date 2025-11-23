// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBy_CWtXNdq3_AXxSQCbihEIFzUYKFIvXA",
  authDomain: "confusion-heatmap.firebaseapp.com",
  projectId: "confusion-heatmap",
  databaseURL: "https://confusion-heatmap-default-rtdb.firebaseio.com",
  storageBucket: "confusion-heatmap.firebasestorage.app",
  messagingSenderId: "353547433876",
  appId: "1:353547433876:web:42aabd79404c1ae2734181",
  measurementId: "G-EY5F8XXS9Q"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
window.firebaseDB = firebase.database();