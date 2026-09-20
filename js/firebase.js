/* =========================================================
   DAV AI — FIREBASE INIT
   ---------------------------------------------------------
   Independent Firebase project: davai-2c6fc
   Realtime Database (not Firestore).
   Auth: Email/Password + Google.

   This module exports:
       app             — the Firebase app instance
       auth            — Auth instance
       db              — Realtime Database instance
       googleProvider  — configured GoogleAuthProvider

   Consumers import what they need from here, plus the
   SDK functions they need directly from the CDN.
   ========================================================= */

import { initializeApp }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import { getAuth, GoogleAuthProvider }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import { getDatabase }
    from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";


const firebaseConfig = {
    apiKey:            "AIzaSyCW6fuYiS6VR-BRWLixLvG4Tr9QSaWJjIk",
    authDomain:        "davai-2c6fc.firebaseapp.com",
    databaseURL:       "https://davai-2c6fc-default-rtdb.firebaseio.com",
    projectId:         "davai-2c6fc",
    storageBucket:     "davai-2c6fc.firebasestorage.app",
    messagingSenderId: "926006871936",
    appId:             "1:926006871936:web:9a63e4648113fc806b2365"
};


export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getDatabase(app);

export const googleProvider = new GoogleAuthProvider();
