// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAIflOA9fe4ShEqnIJLDsFN3zfbclggnkk",
  authDomain: "expenselake.firebaseapp.com",
  projectId: "expenselake",
  storageBucket: "expenselake.firebasestorage.app",
  messagingSenderId: "704094808439",
  appId: "1:704094808439:web:1bb20cb09d009c201e5972",
  measurementId: "G-4QXSTCL9EW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);