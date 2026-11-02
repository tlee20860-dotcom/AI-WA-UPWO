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

  // 使用三層架構的 Modal，內容區留空由 renderOrderEditor 填充
  const content = `<div id="modal-editor-container" class="w-full"></div>`;
  
  // footer 留空，因為 order-editor 自帶儲存與取消按鈕
  const { close, element } = openModal({ title, content, footer: '', size: 'max-w-5xl' });

  const container = element.querySelector('#modal-editor-container');

  renderOrderEditor({
    container: container,
    schema: currentSettings.schema || [],
    formulas: currentSettings.formulas || {},
    viewConfig: currentSettings.view_configs?.['data-entry'] || currentSettings.view_configs?.['table'] || [],
    routeTemplates: currentSettings.route_templates || [],
    materials: currentSettings.materials || [], // 💡 傳入物料主檔
    layoutMode: 'A', // 彈窗內預設用平鋪模式最順暢
    initialData: initialData,
    isViewMode: false, // 直接進入編輯模式
    onSave: async (formData) => {
      const targetId = formData.id || orderId;
      
      if (!targetId || String(targetId).trim() === '') {
        showToast('工單號碼為必填', 'error');
        return;
      }

      try {
        if (!orderId) {
          // 新增
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
          // 手動新增時，開單日期強制抓今天
          formData.uploadDate = new Date().toISOString().split('T')[0];
          formData.statusUpdateDate = formData.uploadDate;

          await setDocument('work_orders', targetId, formData);
          showToast('工單新增成功', 'success');
        } else {
          // 更新
          // 注意：formData 包含了從 order-editor 傳來的所有欄位，其中也包含 materials
          // 為了避免覆蓋 Excel 匯入的 uploadDate，如果工單來源是 excel，則不更新 uploadDate
          const existing = await getDocument('work_orders', targetId);
          if (existing && existing.source === 'excel') {
            delete formData.uploadDate; // 保留 Excel 的開單日期
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
V: 1793062000
W: UPGRADE-007
*/