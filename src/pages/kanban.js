import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderTopTabs, renderViewToggle, bindViewToggle, renderOrders } from '../ui/order-view.js';
import { parseExcelData } from '../domain/parser.js';
import { groupByCategory, calculateStats } from '../domain/stats.js';
import * as XLSX from 'xlsx';
import { createIcons, Upload, Activity, ClipboardList } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let currentStatus = '';
let currentCategory = 'ALL';
let currentView = 'card';
let currentSchema = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 讀取系統設定（取得動態 Schema 與狀態）
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
      title: '流水線進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: `
        <div class="flex items-center gap-3">
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入 Excel
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
          <div id="view-toggle-container">${renderViewToggle(currentView)}</div>
        </div>
      `,
      stats: [],
      controls: `
        <div id="top-tabs-container"></div>
        <div class="flex items-center gap-2 mb-4">
          <span class="text-sm font-medium text-slate-600">類別：</span>
          <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand shadow-sm min-w-[120px]">
            <option value="ALL">全部類別</option>
          </select>
        </div>
      `,
      listContainerId: 'kanban-container'
    });

    // 3. 綁定事件
    this.bindEvents();

    createIcons({
      icons: { Upload, Activity, ClipboardList },
      attrs: { class: 'w-4 h-4' }
    });

    // 4. 初始化資料監聽
    this.initDataListener();
  },

  bindEvents() {
    const btnImport = document.getElementById('btn-import-excel');
    const fileInput = document.getElementById('excel-import-input');
    if (btnImport && fileInput) {
      btnImport.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    bindViewToggle((view) => {
      currentView = view;
      this.renderContent();
    });

    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      this.renderContent();
    });
  },

  initDataListener() {
    let statuses = AppState.getStatuses();
    if (!statuses || statuses.length === 0) {
      statuses = ['排產中', '印刷', '裁切', '品檢', '出貨'];
    }
    if (!currentStatus) currentStatus = statuses[0];

    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateUI(statuses);
    });
  },

  updateUI(statuses) {
    // 1. 更新狀態統計與統計卡片
    const stats = calculateStats(currentOrders, statuses);
    const statsContainer = document.querySelector('#app-content > .grid');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="glass-card p-5 flex flex-col gap-2">
          <span class="text-sm text-slate-500 font-medium flex items-center gap-2">
            <i data-lucide="clipboard-list" class="w-4 h-4 text-brand"></i> 總工單數
          </span>
          <span class="text-3xl font-bold text-slate-900">${stats.total}</span>
        </div>
        ${statuses.slice(0, 3).map(s => `
          <div class="glass-card p-5 flex flex-col gap-2">
            <span class="text-sm text-slate-500 font-medium flex items-center gap-2">
              <i data-lucide="activity" class="w-4 h-4 text-blue-500"></i> ${s}
            </span>
            <span class="text-3xl font-bold text-slate-900">${stats.byStatus[s] || 0}</span>
          </div>
        `).join('')}
      `;
      createIcons({ icons: { Activity, ClipboardList }, attrs: { class: 'w-4 h-4' } });
    }

    // 2. 更新類別下拉選單
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect) {
      const grouped = groupByCategory(currentOrders);
      const categories = Object.keys(grouped).sort();
      
      if (currentCategory !== 'ALL' && !categories.includes(currentCategory)) {
        currentCategory = 'ALL';
      }

      categorySelect.innerHTML = `<option value="ALL">全部類別</option>` + 
        categories.map(c => `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c} (${grouped[c].length})</option>`).join('');
    }

    // 3. 更新頂部狀態按鈕列
    const tabItems = statuses.map(s => ({
      value: s,
      label: s,
      count: currentOrders.filter(o => o.status === s).length
    }));
    
    renderTopTabs('top-tabs-container', tabItems, currentStatus, (newStatus) => {
      currentStatus = newStatus;
      this.updateUI(statuses); // 重新渲染按鈕狀態與內容
    });

    // 4. 渲染工單內容
    this.renderContent();
  },

  renderContent() {
    // 過濾資料
    let filtered = currentOrders;
    if (currentStatus) {
      filtered = filtered.filter(o => o.status === currentStatus);
    }
    if (currentCategory && currentCategory !== 'ALL') {
      filtered = filtered.filter(o => {
        const cat = o.data && o.data.category ? o.data.category : '其他';
        return cat === currentCategory;
      });
    }

    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';

    renderOrders({
      containerId: 'kanban-container',
      orders: filtered,
      viewType: currentView,
      schema: currentSchema,
      isAdmin: isAdmin,
      onDelete: async (id) => {
        const confirmed = await openConfirm({
          title: '刪除工單',
          message: `確定要徹底刪除工單「${id}」嗎？`,
          isDanger: true,
          confirmText: '確認刪除'
        });
        if (confirmed) {
          await deleteDocument('work_orders', id);
          showToast(`工單 ${id} 已刪除`, 'success');
        }
      },
      onStatusChange: async (id) => {
        // 由於表格視圖沒有下拉選單，這裡用 prompt 快速選擇（或者可以開彈窗）
        const newStatus = window.prompt(`請輸入要流轉的狀態名稱（例如：印刷、裁切）：`);
        if (newStatus && newStatus.trim()) {
          const nowStr = new Date().toISOString();
          await updateDocument('work_orders', id, { status: newStatus.trim(), statusUpdateDate: nowStr });
          showToast(`工單 ${id} 已流轉至【${newStatus.trim()}】`, 'success');
        }
      }
    });

    // 為卡片視圖的流轉按鈕綁定事件
    if (currentView === 'card' && isAdmin) {
      const statuses = AppState.getStatuses() || [];
      document.querySelectorAll('.status-options').forEach(container => {
        const orderId = container.dataset.id;
        const currentOrder = currentOrders.find(o => o.id === orderId);
        if (!currentOrder) return;

        const otherStatuses = statuses.filter(s => s !== currentOrder.status);
        container.innerHTML = otherStatuses.map(s => `
          <button class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors btn-change-status" data-new-status="${s}">
            移至 ${s}
          </button>
        `).join('');

        container.querySelectorAll('.btn-change-status').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newStatus = btn.dataset.newStatus;
            btn.disabled = true;
            btn.textContent = '處理中...';
            try {
              const nowStr = new Date().toISOString();
              await updateDocument('work_orders', orderId, { status: newStatus, statusUpdateDate: nowStr });
              showToast(`工單 ${orderId} 已流轉至【${newStatus}】`, 'success');
            } catch (err) {
              showToast('更新失敗', 'error');
            }
          });
        });
      });

      // 綁定下拉選單的開關
      document.querySelectorAll('.btn-dropdown').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.nextElementSibling;
          document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
          });
          menu.classList.toggle('hidden');
        });
      });
      document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
      }, { once: true });
    }
  },

  async handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (jsonData.length < 2) {
          showToast('Excel 檔案沒有資料', 'error');
          return;
        }

        const headers = jsonData[0];
        const rows = jsonData.slice(1);

        showToast('解析中，請稍候...', 'info');

        let salesMapping = [];
        let currentStatuses = AppState.getStatuses() || ['排產中'];
        
        try {
          const settingsDoc = await getDocument('settings', 'main');
          if (settingsDoc) {
            salesMapping = settingsDoc.sales_mapping || [];
            if (settingsDoc.statuses && settingsDoc.statuses.length > 0) {
              currentStatuses = settingsDoc.statuses;
            }
            if (settingsDoc.schema) {
              currentSchema = settingsDoc.schema;
            }
          }
        } catch (err) {}

        const parsedOrders = parseExcelData(headers, rows, salesMapping, currentStatuses[0], currentSchema);

        let addedCount = 0;
        let updatedCount = 0;

        for (const order of parsedOrders) {
          const existing = await getDocument('work_orders', order.id);
          if (existing) {
            await updateDocument('work_orders', order.id, {
              salesReps: order.salesReps,
              uploadDate: order.uploadDate,
              data: order.data
            });
            updatedCount++;
          } else {
            await setDocument('work_orders', order.id, order);
            addedCount++;
          }
        }

        showToast(`匯入完成！新增 ${addedCount} 筆，更新 ${updatedCount} 筆。`, 'success');
        e.target.value = '';

      } catch (error) {
        console.error('Import Error:', error);
        showToast(`匯入失敗：${error.message || '請檢查檔案格式'}`, 'error');
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    currentOrders = [];
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/kanban.js
V: 1792913000
W: UPGRADE-002
═══ */