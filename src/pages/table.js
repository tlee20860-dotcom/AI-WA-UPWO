import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { deleteDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { exportToExcel, exportToPDF } from '../lib/io.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderViewToggle, bindViewToggle, renderOrders } from '../ui/order-view.js';
import { createIcons, Download, FileText } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let filteredOrders = [];
let currentSchema = [];
let currentCategory = 'ALL';
let currentView = 'table'; // 總表預設用表格

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 讀取系統設定（取得動態 Schema）
    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc && settingsDoc.schema) {
        currentSchema = settingsDoc.schema;
      }
    } catch (err) {
      console.warn('無法讀取欄位設定，將以預設模式顯示', err);
    }

    // 2. 渲染頁面骨架
    renderPageLayout({
      title: '管理總表',
      subtitle: '所有工單的狀態與時間追蹤列表',
      headerActions: `
        <div class="flex items-center gap-3">
          <button id="btn-export-excel" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="download" class="w-4 h-4"></i> Excel
          </button>
          <button id="btn-export-pdf" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="file-text" class="w-4 h-4"></i> PDF
          </button>
          <div id="view-toggle-container">${renderViewToggle(currentView)}</div>
        </div>
      `,
      stats: [],
      controls: `
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-slate-600">類別篩選：</span>
            <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand shadow-sm min-w-[120px]">
              <option value="ALL">全部類別</option>
            </select>
          </div>
        </div>
      `,
      listContainerId: 'table-container'
    });

    // 3. 綁定事件
    this.bindHeaderEvents();

    bindViewToggle((view) => {
      currentView = view;
      this.renderContent();
    });

    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      this.renderContent();
    });

    createIcons({
      icons: { Download, FileText },
      attrs: { class: 'w-4 h-4' }
    });

    // 4. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateCategoryFilter();
      this.renderContent();
    });
  },

  updateCategoryFilter() {
    const categorySelect = document.getElementById('filter-category');
    if (!categorySelect) return;

    // 提取不重複的類別
    const categoriesSet = new Set();
    currentOrders.forEach(o => {
      let cat = o.data && o.data.category;
      if (!cat) {
        const match = String(o.id).match(/^[a-zA-Z]+/);
        cat = match ? match[0].toUpperCase() : '其他';
      }
      categoriesSet.add(cat);
    });

    const categories = Array.from(categoriesSet).sort();
    
    if (currentCategory !== 'ALL' && !categories.includes(currentCategory)) {
      currentCategory = 'ALL';
    }

    categorySelect.innerHTML = `<option value="ALL">全部類別</option>` + 
      categories.map(c => `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c}</option>`).join('');
  },

  renderContent() {
    // 過濾資料
    filteredOrders = currentOrders;
    if (currentCategory !== 'ALL') {
      filteredOrders = filteredOrders.filter(o => {
        const cat = o.data && o.data.category ? o.data.category : '其他';
        return cat === currentCategory;
      });
    }

    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';

    renderOrders({
      containerId: 'table-container',
      orders: filteredOrders,
      viewType: currentView,
      schema: currentSchema,
      isAdmin: isAdmin,
      onDelete: async (id) => {
        const confirmed = await openConfirm({
          title: '刪除工單',
          message: `確定要徹底刪除工單「${id}」嗎？此操作無法復原，包含手動填寫的狀態與交期都會被刪除。`,
          isDanger: true,
          confirmText: '確認刪除'
        });

        if (confirmed) {
          await deleteDocument('work_orders', id);
          showToast(`工單 ${id} 已刪除`, 'success');
        }
      },
      onStatusChange: async (id) => {
        const newStatus = window.prompt(`請輸入要流轉的狀態名稱（例如：印刷、裁切）：`);
        if (newStatus && newStatus.trim()) {
          const nowStr = new Date().toISOString();
          await updateDocument('work_orders', id, { status: newStatus.trim(), statusUpdateDate: nowStr });
          showToast(`工單 ${id} 已流轉至【${newStatus.trim()}】`, 'success');
        }
      }
    });
  },

  bindHeaderEvents() {
    const statuses = AppState.getStatuses() || ['排產中', '印刷', '裁切', '品檢', '出貨'];

    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
      if (filteredOrders.length === 0) {
        showToast('無資料可匯出', 'info');
        return;
      }
      try {
        exportToExcel(filteredOrders, statuses, 'UPGRADE_工單總表', currentSchema);
        showToast('Excel 匯出成功', 'success');
      } catch (err) {
        console.error(err);
        showToast('Excel 匯出失敗', 'error');
      }
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
      if (filteredOrders.length === 0) {
        showToast('無資料可匯出', 'info');
        return;
      }
      try {
        exportToPDF(filteredOrders, statuses, 'UPGRADE_工單總表', currentSchema);
        showToast('PDF 匯出成功', 'success');
      } catch (err) {
        console.error(err);
        showToast('PDF 匯出失敗', 'error');
      }
    });
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    currentOrders = [];
    filteredOrders = [];
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/table.js
V: 1792913600
W: UPGRADE-002
═══ */