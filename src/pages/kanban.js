import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { groupByStatus, groupByCategory, calculateStats } from '../domain/stats.js';
import { parseExcelData } from '../domain/parser.js';
import * as XLSX from 'xlsx';
import { createIcons, MoreVertical, ChevronDown, User, Calendar, Upload, CheckCircle2, AlertCircle, Activity, ClipboardList, LayoutGrid, List } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let currentStatus = '';
let currentCategory = 'ALL';
let currentView = 'card'; // 'card' or 'table'

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '流水線進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: `
        <div class="flex items-center gap-2">
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入 Excel
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
          
          <!-- 視圖切換按鈕 -->
          <div class="segmented-control hidden sm:inline-flex">
            <button id="btn-view-card" class="segment-btn ${currentView === 'card' ? 'active' : ''} flex items-center gap-1">
              <i data-lucide="layout-grid" class="w-4 h-4"></i> 卡片
            </button>
            <button id="btn-view-table" class="segment-btn ${currentView === 'table' ? 'active' : ''} flex items-center gap-1">
              <i data-lucide="list" class="w-4 h-4"></i> 表格
            </button>
          </div>
        </div>
      `,
      stats: [],
      controls: `
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-slate-600">狀態：</span>
            <select id="filter-status" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand shadow-sm min-w-[120px]">
              <!-- 由 renderControls 注入 -->
            </select>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-slate-600">類別：</span>
            <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand shadow-sm min-w-[120px]">
              <option value="ALL">全部類別</option>
              <!-- 由 renderControls 注入 -->
            </select>
          </div>
        </div>
      `,
      listContainerId: 'kanban-container'
    });

    // 2. 優先綁定事件
    this.bindEvents();

    // 3. 渲染初始圖示
    createIcons({
      icons: { Upload, LayoutGrid, List },
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

    // 視圖切換
    document.getElementById('btn-view-card')?.addEventListener('click', () => {
      currentView = 'card';
      document.getElementById('btn-view-card').classList.add('active');
      document.getElementById('btn-view-table').classList.remove('active');
      this.renderContent();
    });
    document.getElementById('btn-view-table')?.addEventListener('click', () => {
      currentView = 'table';
      document.getElementById('btn-view-table').classList.add('active');
      document.getElementById('btn-view-card').classList.remove('active');
      this.renderContent();
    });

    // 篩選器
    document.getElementById('filter-status')?.addEventListener('change', (e) => {
      currentStatus = e.target.value;
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
      this.updateFiltersAndRender(statuses);
    });
  },

  updateFiltersAndRender(statuses) {
    // 更新狀態下拉選單
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.innerHTML = statuses.map(s => 
        `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s} (${currentOrders.filter(o => o.status === s).length})</option>`
      ).join('');
    }

    // 更新類別下拉選單
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect) {
      const grouped = groupByCategory(currentOrders);
      const categories = Object.keys(grouped).sort();
      
      if (currentCategory !== 'ALL' && !categories.includes(currentCategory)) {
        currentCategory = 'ALL';
      }

      categorySelect.innerHTML = `<option value="ALL">全部類別</option>` + 
        categories.map(c => 
          `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c} (${grouped[c].length})</option>`
        ).join('');
    }

    // 更新統計卡片
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

    this.renderContent();
  },

  renderContent() {
    const container = document.getElementById('kanban-container');
    if (!container) return;

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

    if (currentView === 'card') {
      this.renderCardView(container, filtered);
    } else {
      this.renderTableView(container, filtered);
    }
  },

  renderCardView(container, orders) {
    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">此狀態或類別下無工單</span>
        </div>
      `;
      createIcons({ attrs: { class: 'w-12 h-12' } });
      return;
    }

    const boardHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
        ${orders.map(order => this.renderCard(order, isAdmin)).join('')}
      </div>
    `;

    container.innerHTML = boardHtml;
    createIcons({
      icons: { MoreVertical, ChevronDown, User, Calendar },
      attrs: { class: 'w-4 h-4' }
    });

    this.bindCardEvents();
  },

  renderTableView(container, orders) {
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">無工單資料</span>
        </div>
      `;
      createIcons({ attrs: { class: 'w-12 h-12' } });
      return;
    }

    const html = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col w-full">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr class="bg-slate-50/80 border-b border-slate-200/60 text-sm font-semibold text-slate-600">
                <th class="px-6 py-4 rounded-tl-[20px]">工單號碼</th>
                <th class="px-6 py-4">類別</th>
                <th class="px-6 py-4">銷售員</th>
                <th class="px-6 py-4">上傳日期</th>
                <th class="px-6 py-4">交期</th>
                <th class="px-6 py-4 rounded-tr-[20px]">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
              ${orders.map(order => {
                const cat = order.data && order.data.category ? order.data.category : '-';
                const reps = (order.salesReps || []).join(', ');
                return `
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4 font-bold text-slate-900">${order.id}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 rounded-md text-xs">${cat}</span></td>
                    <td class="px-6 py-4 text-slate-500">${reps}</td>
                    <td class="px-6 py-4 text-slate-500">${order.uploadDate || '-'}</td>
                    <td class="px-6 py-4 text-slate-500">${order.dueDate || '-'}</td>
                    <td class="px-6 py-4 text-brand font-medium cursor-pointer">流轉</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    container.innerHTML = html;
  },

  renderCard(order, isAdmin) {
    const statuses = AppState.getStatuses() || [];
    const otherStatuses = statuses.filter(s => s !== order.status);
    const uploadDate = order.uploadDate ? order.uploadDate.split('T')[0] : '';
    const salesReps = order.salesReps ? order.salesReps.join(', ') : '未填寫';
    const category = order.data && order.data.category ? order.data.category : '其他';
    
    let customerName = order.data ? (order.data['customerNameZh'] || order.data['customerNameEn'] || '') : '';
    if (customerName.includes('***')) customerName = '';
    
    return `
      <div class="glass-card p-4 relative card-item !overflow-visible" data-id="${order.id}" data-current-status="${order.status}">
        <div class="flex justify-between items-start mb-2">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-900">${order.id}</span>
            <span class="text-[10px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">${category}</span>
          </div>
          <span class="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-md">${uploadDate}</span>
        </div>
        
        <div class="flex flex-col gap-1.5 mb-3">
          ${customerName ? `<div class="text-sm text-slate-600 truncate">客戶：${customerName}</div>` : ''}
          <div class="flex items-center gap-1.5 text-xs text-slate-500">
            <i data-lucide="user" class="w-3.5 h-3.5"></i> ${salesReps}
          </div>
          ${order.dueDate ? `<div class="text-xs text-amber-600 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> 交期：${order.dueDate}</div>` : ''}
        </div>

        ${isAdmin ? `
          <div class="mt-3 pt-3 border-t border-slate-100 relative">
            <button class="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-brand transition-colors btn-dropdown">
              <span>流轉工序</span>
              <i data-lucide="chevron-down" class="w-4 h-4 transition-transform"></i>
            </button>
            
            <!-- 修復：提高 z-index 並加上絕對定位 -->
            <div class="dropdown-menu hidden absolute left-0 right-0 bottom-full mb-1 bg-white border border-slate-100 shadow-xl rounded-xl p-1 z-[999]">
              ${otherStatuses.map(s => `
                <button class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors btn-change-status" data-new-status="${s}">
                  移至 ${s}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  bindCardEvents() {
    document.querySelectorAll('.card-item').forEach(card => {
      const btnDropdown = card.querySelector('.btn-dropdown');
      const dropdownMenu = card.querySelector('.dropdown-menu');
      const btnChangeStatuses = card.querySelectorAll('.btn-change-status');

      if (btnDropdown && dropdownMenu) {
        btnDropdown.addEventListener('click', (e) => {
          e.stopPropagation();
          
          document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== dropdownMenu) m.classList.add('hidden');
          });

          dropdownMenu.classList.toggle('hidden');
          const icon = btnDropdown.querySelector('i');
          if (dropdownMenu.classList.contains('hidden')) {
            icon.style.transform = 'rotate(0deg)';
          } else {
            icon.style.transform = 'rotate(180deg)';
          }
        });

        btnChangeStatuses.forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newStatus = btn.dataset.newStatus;
            const orderId = card.dataset.id;
            
            btn.disabled = true;
            btn.textContent = '處理中...';

            try {
              const nowStr = new Date().toISOString();
              await updateDocument('work_orders', orderId, {
                status: newStatus,
                statusUpdateDate: nowStr
              });
              
              showToast(`工單 ${orderId} 已流轉至【${newStatus}】`, 'success');
            } catch (error) {
              console.error('Update status failed:', error);
              showToast('更新狀態失敗', 'error');
              btn.disabled = false;
              btn.textContent = `移至 ${newStatus}`;
            }
          });
        });
      }
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-menu').forEach(m => {
        m.classList.add('hidden');
        const icon = m.parentElement.querySelector('.btn-dropdown i');
        if (icon) icon.style.transform = 'rotate(0deg)';
      });
    }, { once: true });
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
        let currentSchema = [];
        
        try {
          const settingsDoc = await getDocument('settings', 'main');
          if (settingsDoc) {
            salesMapping = settingsDoc.sales_mapping || [];
            if (settingsDoc.statuses && settingsDoc.statuses.length > 0) {
              currentStatuses = settingsDoc.statuses;
            }
            currentSchema = settingsDoc.schema || [];
          }
        } catch (err) {
          console.warn('無法讀取設定檔，將使用預設值', err);
        }

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
V: 1792911700
W: UPGRADE-002
═══ */