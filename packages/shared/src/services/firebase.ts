import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCbLbtinVrCMkrXtspOMJTo3lAH6vwXg38",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "realyn-app.firebaseapp.com",
  projectId: "realyn-app",
  storageBucket: "realyn-app.firebasestorage.app",
  messagingSenderId: "819510714783",
  appId: "1:819510714783:web:13cbe50945056346a09daa",
};

// Prevent duplicate app initialization during HMR
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);