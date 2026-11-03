import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { getDocument } from '../db/read.js';
import { setDocument, updateDocument } from '../db/write.js';
import { renderOrderEditor } from './order-editor.js';
import { createIcons } from 'lucide';

/**
 * 開啟工單詳細/編輯彈窗
 * @param {Object} options
 * @param {string|null} options.orderId 若為 null 則為新增
 * @param {Object} options.currentSettings 系統設定
 * @param {Function} options.onSaved 儲存成功後的回呼
 */
export async function openOrderModal({ orderId = null, currentSettings, onSaved }) {
  let initialData = null;
  
  if (orderId) {
    try {
      initialData = await getDocument('work_orders', orderId);
      if (!initialData) {
        showToast('找不到該工單', 'error');
        return;
      }
    } catch (err) {
      showToast('讀取工單失敗', 'error');
      return;
    }
  }

  const title = orderId ? '編輯工單' : '新增工單';

  const content = `<div id="modal-editor-container" class="w-full"></div>`;
  
  const { close, element } = openModal({ title, content, footer: '', size: 'max-w-5xl' });

  const container = element.querySelector('#modal-editor-container');

  renderOrderEditor({
    container: container,
    schema: currentSettings.schema || [],
    formulas: currentSettings.formulas || {},
    viewConfig: currentSettings.view_configs?.['data-entry'] || currentSettings.view_configs?.['table'] || [],
    routeTemplates: currentSettings.route_templates || [],
    customDatabases: currentSettings.custom_databases || [], // 💡 傳入自訂資料庫
    layoutMode: 'A',
    initialData: initialData,
    isViewMode: false,
    onSave: async (formData) => {
      const targetId = formData.id || orderId;
      
      if (!targetId || String(targetId).trim() === '') {
        showToast('工單號碼為必填', 'error');
        return;
      }

      try {
        // 💡 儲存前處理：將關聯欄位的 ID 轉換為名稱，讓匯出 Excel 時能顯示人類看得懂的文字
        (currentSettings.schema || []).forEach(field => {
          if (field.type === 'relation' && !field.isSystem && formData.data && formData.data[field.key]) {
            const val = formData.data[field.key];
            const db = (currentSettings.custom_databases || []).find(d => d.id === field.db_id);
            if (db) {
              const item = db.items.find(i => i.id === val || i.name === val);
              if (item) {
                formData.data[field.key] = item.name; // 轉存名稱
              }
            }
          }
        });

        if (!orderId) {
          const existing = await getDocument('work_orders', targetId);
          if (existing) {
            showToast(`工單 ${targetId} 已存在`, 'error');
            return;
          }

          formData.source = 'manual';
          if (!formData.route || formData.route.length === 0) {
            formData.route = currentSettings.statuses ? [...currentSettings.statuses] : [];
            formData.status = currentSettings.statuses?.[0] || '排產中';
          }
          formData.uploadDate = new Date().toISOString().split('T')[0];
          formData.statusUpdateDate = formData.uploadDate;

          await setDocument('work_orders', targetId, formData);
          showToast('工單新增成功', 'success');
        } else {
          const existing = await getDocument('work_orders', targetId);
          if (existing && existing.source === 'excel') {
            delete formData.uploadDate;
          }
          
          await updateDocument('work_orders', targetId, formData);
          showToast('工單更新成功', 'success');
        }

        if (onSaved) onSaved();
        close();
      } catch (err) {
        console.error('[Modal Save Error]', err);
        showToast('儲存失敗', 'error');
      }
    },
    onCancel: () => {
      close();
    }
  });
}

/*
F: AI-WA-UPWO/src/ui/order-detail-modal.js
V: 1793085000
W: UPGRADE-007
*/