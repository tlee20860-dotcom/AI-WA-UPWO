import { db } from "../config/firebase.js";
import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  collection 
} from "firebase/firestore";

/**
 * 指定 ID 寫入文檔（覆寫或建立）
 * 註：若需「防覆寫」邏輯，應在上層（如 parser.js）先使用 getDocument 檢查
 * @param {string} collectionName 集合名稱
 * @param {string} docId 文檔 ID
 * @param {Object} data 要寫入的資料
 */
export async function setDocument(collectionName, docId, data) {
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data);
    return true;
  } catch (error) {
    console.error(`[DB Write Error] setDocument(${collectionName}/${docId}):`, error);
    throw error;
  }
}

/**
 * 自動生成 ID 新增文檔
 * @param {string} collectionName 集合名稱
 * @param {Object} data 要寫入的資料
 * @returns {Promise<string>} 新增的文檔 ID
 */
export async function addDocument(collectionName, data) {
  try {
    const colRef = collection(db, collectionName);
    const docRef = await addDoc(colRef, data);
    return docRef.id;
  } catch (error) {
    console.error(`[DB Write Error] addDocument(${collectionName}):`, error);
    throw error;
  }
}

/**
 * 更新指定文檔的部分欄位
 * @param {string} collectionName 集合名稱
 * @param {string} docId 文檔 ID
 * @param {Object} data 要更新的欄位（僅更新傳入的 key）
 */
export async function updateDocument(collectionName, docId, data) {
  try {
    if (!docId) throw new Error("docId is required for update.");
    if (!data || Object.keys(data).length === 0) throw new Error("data is empty.");
    
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, data);
    return true;
  } catch (error) {
    console.error(`[DB Write Error] updateDocument(${collectionName}/${docId}):`, error);
    throw error;
  }
}

/**
 * 刪除指定文檔
 * @param {string} collectionName 集合名稱
 * @param {string} docId 文檔 ID
 */
export async function deleteDocument(collectionName, docId) {
  try {
    if (!docId) throw new Error("docId is required for delete.");
    
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`[DB Write Error] deleteDocument(${collectionName}/${docId}):`, error);
    throw error;
  }
}

/* ═══ EOF ═══
F: src/db/write.js
V: 1792903504
W: webapp-20261026-001#16
═══ */