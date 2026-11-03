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

  // 💡 處理快速新增物料的邏輯 (由 UI 層呼叫，但在這裡寫入資料庫以保持架構乾淨)
  const handleQuickAddMaterial = async (name) => {
    try {
      const latestSettings = await getDocument('settings', 'main');
      if (!latestSettings) throw new Error('無法讀取設定檔');
      
      const newMatId = 'mat_' + Date.now().toString(36);
      const newMaterial = {
        id: newMatId,
        name: name,
        categories: [], // 預設不綁定類別，或者可以自動綁定 currentCategory，這裡留空為通用
        data: {}
      };

      const updatedMaterials = Array.isArray(latestSettings.materials) ? [...latestSettings.materials] : [];
      updatedMaterials.push(newMaterial);

      // 只更新 materials 欄位，避免覆蓋其他設定
      await updateDocument('settings', 'main', { materials: updatedMaterials });
      
      // 同步更新 currentSettings，讓背景的畫面能更新
      if (currentSettings) {
        currentSettings.materials = updatedMaterials;
      }
      
      // 觸發全域更新事件
      window.dispatchEvent(new Event('settings-updated'));
      
      return newMaterial;
    } catch (err) {
      console.error('Quick add material error:', err);
      throw err;
    }
  };

  renderOrderEditor({
    container: container,
    schema: currentSettings.schema || [],
    formulas: currentSettings.formulas || {},
    viewConfig: currentSettings.view_configs?.['data-entry'] || currentSettings.view_configs?.['table'] || [],
    routeTemplates: currentSettings.route_templates || [],
    materials: currentSettings.materials || [],
    suppliers: currentSettings.suppliers || [],
    layoutMode: 'A',
    initialData: initialData,
    isViewMode: false,
    onQuickAddMaterial: handleQuickAddMaterial, // 💡 傳入
    onSave: async (formData) => {
      const targetId = formData.id || orderId;
      
      if (!targetId || String(targetId).trim() === '') {
        showToast('工單號碼為必填', 'error');
        return;
      }

      try {
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
V: 1793079000
W: UPGRADE-007
*/