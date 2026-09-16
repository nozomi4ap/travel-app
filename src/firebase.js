


import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// ▼▼▼ ここを、Firebaseコンソールで発行したご自身の設定に置き換えてください ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyBfGHOevefAsO9FsyCPp3vKw2T5rtM3RJA",
  authDomain: "travel-app-5b13a.firebaseapp.com",
  projectId: "travel-app-5b13a",
  storageBucket: "travel-app-5b13a.firebasestorage.app",
  messagingSenderId: "158547103359",
  appId: "1:158547103359:web:a9006762e444b44dddf94a",
}
// ▲▲▲ ここまで ▲▲▲

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const storage = getStorage(app)
