import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { parseExcelData } from '../domain/parser.js';
import * as XLSX from 'xlsx';
import { createIcons, Upload } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let currentStatus = '排產中';
let currentCategory = 'ALL';
let schema = [];
let viewConfig = {};

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        currentStatus = (settingsDoc.statuses && settingsDoc.statuses[0]) || '排產中';
      }
    } catch (err) {}

    renderPageLayout({
      title: '生產進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: `
        <div class="flex items-center gap-3">
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
        </div>
      `,
      controls: `
        <div id="status-tabs" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 mb-4"></div>
        <div class="flex items-center gap-2 mb-4">
          <span class="text-sm font-medium text-slate-600">類別：</span>
          <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none shadow-sm min-w-[120px]"></select>
        </div>
      `,
      listContainerId: 'kanban-container'
    });

    document.getElementById('btn-import-excel')?.addEventListener('click', () => document.getElementById('excel-import-input').click());
    document.getElementById('excel-import-input')?.addEventListener('change', (e) => this.handleFileSelect(e));
    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      this.updateUI();
    });

    window.addEventListener('refresh-kanban', this.updateUI.bind(this));
    window.addEventListener('settings-updated', this.updateUI.bind(this));
    createIcons({ icons: { Upload }, attrs: { class: 'w-4 h-4' } });

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
    const statuses = AppState.getStatuses() || [];
    const tabsContainer = document.getElementById('status-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = statuses.map(s => `
        <button class="w-full flex justify-between items-center px-3 py-2 rounded-xl text-sm font-medium border ${s === currentStatus ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-status="${s}">
          <span class="truncate pr-2">${s}</span>
          <span class="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${s === currentStatus ? 'bg-white/20' : 'bg-slate-100'}">${currentOrders.filter(o => o.status === s).length}</span>
        </button>
      `).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentStatus = btn.dataset.status; this.updateUI(); };
      });
    }

    const catSelect = document.getElementById('filter-category');
    if (catSelect) {
      const cats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))).sort();
      catSelect.innerHTML = `<option value="ALL">全部類別</option>` + cats.map(c => `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c}</option>`).join('');
    }

    let filtered = currentOrders.filter(o => o.status === currentStatus);
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    // 依使用者設定的順序對齊欄位
    const visibleFields = (viewConfig['kanban'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'kanban-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'kanban',
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

  async handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        if (jsonData.length < 2) return showToast('無資料', 'error');

        showToast('解析中...', 'info');
        let salesMapping = [], statuses = AppState.getStatuses() || ['排產中'];
        let routeTemplates = [];
        
        try {
          const s = await getDocument('settings', 'main');
          if (s) { 
            salesMapping = s.sales_mapping || []; 
            statuses = s.statuses || statuses; 
            schema = s.schema || schema; 
            routeTemplates = s.route_templates || [];
          }
        } catch (err) {}

        const parsed = parseExcelData(jsonData[0], jsonData.slice(1), salesMapping, statuses[0], schema);
        let added = 0, updated = 0;

        for (const order of parsed) {
          const existing = await getDocument('work_orders', order.id);
          if (existing) {
            // 若存在，僅更新 Excel 相關欄位，保留狀態與製程
            await updateDocument('work_orders', order.id, { salesReps: order.salesReps, uploadDate: order.uploadDate, data: order.data });
            updated++;
          } else {
            // 新工單：依工單類別尋找對應的模板
            const orderCategory = order.data.category || '其他';
            
            // 優先找類別相符的，再找通用預設 (category 為空)
            let matchedTemplate = routeTemplates.find(t => t.category === orderCategory);
            if (!matchedTemplate) {
              matchedTemplate = routeTemplates.find(t => !t.category || t.category === '');
            }

            // 若找到模板且不為空，套用模板；否則套用全站狀態
            if (matchedTemplate && matchedTemplate.steps && matchedTemplate.steps.length > 0) {
              order.route = matchedTemplate.steps.slice();
              order.status = matchedTemplate.steps[0];
            } else {
              order.route = statuses.slice();
              order.status = statuses[0];
            }

            await setDocument('work_orders', order.id, order);
            added++;
          }
        }
        showToast(`匯入完成！新增 ${added}，更新 ${updated}`, 'success');
        e.target.value = '';
      } catch (error) {
        showToast(`失敗: ${error.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-kanban', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/kanban.js
V: 1792926500
W: UPGRADE-004
═══ */