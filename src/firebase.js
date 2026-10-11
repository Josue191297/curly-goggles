import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// The web config is public by design; access is enforced by firestore.rules.
const app = initializeApp({
  apiKey: 'AIzaSyDylzFP9MFF2ktj9lW-S_uP_n-pBaQEywA',
  authDomain: 'tasks-projects-1f5c2.firebaseapp.com',
  projectId: 'tasks-projects-1f5c2',
  storageBucket: 'tasks-projects-1f5c2.firebasestorage.app',
  messagingSenderId: '36314986938',
  appId: '1:36314986938:web:fec117fb74111ac1c54583',
})

export const auth = getAuth(app)
export const provider = new GoogleAuthProvider()
export const db = getFirestore(app)

// Keep in sync with the email list in firestore.rules.
export const PEOPLE = {
  'josuesalazar1912@gmail.com': 'Josue',
  'larissawawis@gmail.com': 'Larissa',
}
