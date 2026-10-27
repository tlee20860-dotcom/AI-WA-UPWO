import { db } from "../config/firebase.js";
import { 
  collection, 
  getDocs, 
  onSnapshot, 
  doc, 
  getDoc 
} from "firebase/firestore";

/**
 * 一次性取得整個集合的資料
 * @param {string} collectionName 集合名稱
 * @returns {Promise<Array>} 包含 id 與資料的陣列
 */
export async function getCollection(collectionName) {
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`[DB Read Error] getCollection(${collectionName}):`, error);
    throw error;
  }
}

/**
 * 監聽整個集合的即時變更
 * @param {string} collectionName 集合名稱
 * @param {function} callback 回呼函式，接收包含 id 與資料的陣列
 * @returns {function} 取消監聽的函式
 */
export function listenCollection(collectionName, callback) {
  const colRef = collection(db, collectionName);
  
  const unsubscribe = onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(data);
  }, (error) => {
    console.error(`[DB Read Error] listenCollection(${collectionName}):`, error);
  });

  return unsubscribe;
}

/**
 * 一次性取得單一文檔資料
 * @param {string} collectionName 集合名稱
 * @param {string} docId 文檔 ID
 * @returns {Promise<Object|null>} 資料物件或 null
 */
export async function getDocument(collectionName, docId) {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[DB Read Error] getDocument(${collectionName}/${docId}):`, error);
    throw error;
  }
}

/**
 * 監聽單一文檔的即時變更
 * @param {string} collectionName 集合名稱
 * @param {string} docId 文檔 ID
 * @param {function} callback 回呼函式，接收資料物件或 null
 * @returns {function} 取消監聽的函式
 */
export function listenDocument(collectionName, docId, callback) {
  const docRef = doc(db, collectionName, docId);

  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    } else {
      callback(null);
    }
  }, (error) => {
    console.error(`[DB Read Error] listenDocument(${collectionName}/${docId}):`, error);
  });

  return unsubscribe;
}

/* ═══ EOF ═══
F: src/db/read.js
V: 1792903503
W: webapp-20261026-001#15
═══ */