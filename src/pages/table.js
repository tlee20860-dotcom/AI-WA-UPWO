import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { deleteDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { exportToExcel, exportToPDF } from '../lib/io.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { handleExcelUpload, downloadLatestExcel, onSyncStateChange, clearBinding } from '../engine/sync-engine.js';
import { createIcons, FileText, Upload, Save, X } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let route_templates = [];
let currentCategory = 'ALL';
let currentSettings = null;

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      currentSettings = await getDocument('settings', 'main');
      if (currentSettings) {
        schema = currentSettings.schema || [];
        viewConfig = currentSettings.view_configs || {};
        route_templates = currentSettings.route_templates || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '管理總表',
      subtitle: '所有工單的狀態、時間與流程追蹤列表',
      headerActions: `
        <div class="flex flex-wrap items-center gap-2">
          <div id="upload-wrapper" class="flex items-center border border-brand/30 rounded-[10px] overflow-hidden shadow-sm">
            <button id="btn-upload-excel" class="bg-white text-brand px-3 py-2 text-sm font-medium hover:bg-brand/5 flex items-center gap-2 transition-colors">
              <i data-lucide="upload" class="w-4 h-4"></i> 上傳 Excel
            </button>
            <button id="btn-unbind-excel" class="bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-2 py-2 border-l border-brand/20 hidden transition-colors" title="解除綁定">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
          <input type="file" id="excel-upload-input" accept=".xlsx, .xls" class="hidden">
          
          <button id="btn-download-excel" class="bg-brand text-white border border-brand px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-brand-hover flex items-center gap-2 shadow-sm transition-colors opacity-50 cursor-not-allowed" disabled>
            <i data-lucide="save" class="w-4 h-4"></i> 下載最新進度
          </button>
          
          <button id="btn-export-pdf" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="file-text" class="w-4 h-4"></i> PDF
          </button>
        </div>
      `,
      controls: `
        <div class="flex items-center gap-2 mb-4">
          <span class="text-sm font-medium text-slate-600">類別：</span>
          <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none shadow-sm min-w-[120px]"></select>
        </div>
      `,
      listContainerId: 'table-container'
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', () => this.handleExport('pdf'));
    
    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      this.updateUI();
    });

    document.getElementById('btn-upload-excel')?.addEventListener('click', () => {
      document.getElementById('excel-upload-input').click();
    });

    document.getElementById('btn-unbind-excel')?.addEventListener('click', () => {
      clearBinding();
    });

    document.getElementById('excel-upload-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleExcelUpload(file);
      }
      e.target.value = ''; 
    });

    document.getElementById('btn-download-excel')?.addEventListener('click', () => {
      downloadLatestExcel();
    });

    onSyncStateChange((state) => {
      const uploadBtn = document.getElementById('btn-upload-excel');
      const unbindBtn = document.getElementById('btn-unbind-excel');
      const downloadBtn = document.getElementById('btn-download-excel');
      const uploadWrapper = document.getElementById('upload-wrapper');
      
      if (uploadBtn && unbindBtn && uploadWrapper) {
        if (state.isBound) {
          uploadBtn.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> 已載入：${state.fileName}`;
          uploadBtn.classList.add('bg-brand/5');
          unbindBtn.classList.remove('hidden');
          uploadWrapper.classList.add('bg-brand/5');
        } else {
          uploadBtn.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> 上傳 Excel`;
          uploadBtn.classList.remove('bg-brand/5');
          unbindBtn.classList.add('hidden');
          uploadWrapper.classList.remove('bg-brand/5');
        }
      }

      if (downloadBtn) {
        if (state.isBound) {
          downloadBtn.disabled = false;
          downloadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          downloadBtn.disabled = true;
          downloadBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
      }

      try {
        createIcons({ icons: { Upload, Save, X }, attrs: { class: 'w-4 h-4' } });
      } catch (e) {
        console.warn('Icon render error:', e);
      }
    });

    window.addEventListener('refresh-table', this.updateUI.bind(this));
    
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          currentSettings = settingsDoc;
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          route_templates = settingsDoc.route_templates || [];
          this.updateUI();
        }
      } catch (err) {}
    });

    try {
      createIcons({ icons: { FileText, Upload, Save, X }, attrs: { class: 'w-4 h-4' } });
    } catch (e) {
      console.warn('Icon render error:', e);
    }

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
    const catSelect = document.getElementById('filter-category');
    if (catSelect) {
      const cats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))).sort();
      catSelect.innerHTML = `<option value="ALL">全部類別</option>` + cats.map(c => `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c}</option>`).join('');
    }

    let filtered = currentOrders;
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    let visibleFields = (viewConfig['table'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    if (!visibleFields.some(f => f.key === 'route_select')) {
      visibleFields.unshift({ key: 'route_select', label: '製程路線圖', isVisible: true });
    }

    renderOrderView({
      containerId: 'table-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'table',
      route_templates: route_templates,
      onAction: async (action, id, newStatus) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'status_change') {
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  handleExport(type) {
    if (currentOrders.length === 0) return showToast('無資料可匯出', 'info');
    const statuses = AppState.getStatuses() || [];
    try {
      if (type === 'excel') exportToExcel(currentOrders, statuses, '工單總表', schema, viewConfig['export']);
      else exportToPDF(currentOrders, statuses, '工單總表', schema);
      showToast('匯出成功', 'success');
    } catch (err) {
      console.error(err);
      showToast('匯出失敗', 'error');
    }
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-table', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/table.js
V: 1794188200
W: UPGRADE-009
═══ */