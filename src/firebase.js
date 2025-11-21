import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "AIzaSyCbLbtinVrCMkrXtspOMJTo3lAH6vwXg38",
  authDomain: "realyn-app.firebaseapp.com",
  projectId: "realyn-app",
  storageBucket: "realyn-app.firebasestorage.app",
  messagingSenderId: "819510714783",
  appId: "1:819510714783:web:13cbe50945056346a09daa",
  measurementId: "G-N60DG1LPSC" // optional, fine to leave in
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

export { db, auth }
