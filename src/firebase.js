// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCyCqIJyx-m-N30m19V2Ki0KfYpM263yP8",
  authDomain: "room-management-tau.firebaseapp.com",
  databaseURL: "https://room-management-tau-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "room-management-tau",
  storageBucket: "room-management-tau.firebasestorage.app",
  messagingSenderId: "655338032991",
  appId: "1:655338032991:web:f7cb87acdf1bd4b23430ea"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);