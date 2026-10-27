import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { FIREBASE_CONFIG } from "./firebase-keys.js";

// 初始化 Firebase App
const app = initializeApp(FIREBASE_CONFIG);

// 初始化並匯出 Firestore 實例
export const db = getFirestore(app);

/* ═══ EOF ═══
F: src/config/firebase.js
V: 1792903502
W: webapp-20261026-001#14
═══ */