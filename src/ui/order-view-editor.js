import { updateDocument } from '../db/write.js';
import { showToast } from '../ui/toast.js';

/**
 * 全域行內編輯處理器
 * 負責接收 order-view.js 拋出的 inline-edit 事件，並寫入 Firestore。
 */
window.addEventListener('inline-edit', async (e) => {
  const { id, key, value } = e.detail;
  if (!id || !key) return;

  try {
    const updateData = {};
    
    // 系統核心欄位清單（直接更新根節點）
    const coreFields = ['id', 'status', 'salesReps', 'uploadDate', 'dueDate', 'statusUpdateDate'];
    
    if (coreFields.includes(key)) {
      updateData[key] = value;
    } else {
      // 動態欄位必須使用點記法 (dot notation) 更新 data 物件內的屬性
      updateData[`data.${key}`] = value;
    }

    await updateDocument('work_orders', id, updateData);
    showToast(`已更新資料`, 'success');
    
  } catch (error) {
    console.error('[Inline Edit Error]', error);
    showToast('更新失敗，請檢查網路或稍後再試', 'error');
  }
});

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/order-view-editor.js
V: 1792921100
W: UPGRADE-004
═══ */