// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDrE4QAmlfuXQzG_h7INY2v_shjFS5-ays",
  authDomain: "lowcard-c1a99.firebaseapp.com",
  databaseURL: "https://lowcard-c1a99-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lowcard-c1a99",
  storageBucket: "lowcard-c1a99.firebasestorage.app",
  messagingSenderId: "541429473781",
  appId: "1:541429473781:web:1085330d69309db88bc0bc",
  measurementId: "G-3XNCDX69QQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);