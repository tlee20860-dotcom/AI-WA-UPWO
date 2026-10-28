import { AppState } from '../config/state.js';
import { listenCollection, getDocument, getCollection } from '../db/read.js';
import { deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { createIcons, Database, Trash2 } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};

export default {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
      }
    } catch (err) {}

    renderPageLayout({
      title: '資料總管',
      subtitle: '最高權限資料檢視與清理',
      headerActions: `
        <button id="btn-clear-all" class="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-[10px] text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
          <i data-lucide="trash-2" class="w-4 h-4"></i> 一鍵清空資料庫
        </button>
      `,
      stats: [],
      controls: '',
      listContainerId: 'admin-data-container'
    });

    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
      const confirmed = await openConfirm({
        title: '清空所有資料',
        message: '這將會永久刪除資料庫中的「所有」工單，包含所有狀態與自訂欄位，且無法復原。確定要繼續嗎？',
        isDanger: true,
        confirmText: '確定清空'
      });

      if (!confirmed) return;

      showToast('正在清空所有資料...', 'info');
      try {
        const orders = await getCollection('work_orders');
        let count = 0;
        for (const order of orders) {
          await deleteDocument('work_orders', order.id);
          count++;
        }
        showToast(`成功清空 ${count} 筆工單資料`, 'success');
      } catch (error) {
        console.error('Clear all data error:', error);
        showToast('清空失敗，請查看 Console', 'error');
      }
    });

    createIcons({ icons: { Database, Trash2 }, attrs: { class: 'w-4 h-4' } });

    window.addEventListener('refresh-admin-data', this.updateUI.bind(this));
    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateUI();
    });
  },

  updateUI() {
    renderOrderView({
      containerId: 'admin-data-container',
      orders: currentOrders,
      visibleFields: schema.map(f => ({ ...f, isVisible: true })), // 管理員看全部欄位
      isAdmin: true,
      pageKey: 'admin-data',
      onAction: async (action, id) => {
        if (action === 'delete') {
          const confirmed = await openConfirm({
            title: '刪除工單',
            message: `確定要徹底刪除工單「${id}」嗎？此操作無法復原。`,
            isDanger: true,
            confirmText: '確認刪除'
          });
          if (confirmed) {
            try {
              await deleteDocument('work_orders', id);
              showToast(`工單 ${id} 已刪除`, 'success');
            } catch (err) {
              showToast('刪除失敗', 'error');
            }
          }
        } else if (action === 'status_change') {
          // 管理員頁面也允許直接改狀態
          const newStatus = window.prompt('請輸入目標狀態：');
          if (newStatus && newStatus.trim()) {
            const { updateDocument } = await import('../db/write.js');
            await updateDocument('work_orders', id, { status: newStatus.trim(), statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-admin-data', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/admin-data.js
V: 1792917700
W: UPGRADE-003
═══ */