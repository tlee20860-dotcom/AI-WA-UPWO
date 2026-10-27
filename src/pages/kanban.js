import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { groupByStatus, calculateStats } from '../domain/stats.js';
import { parseExcelData } from '../domain/parser.js';
import * as XLSX from 'xlsx';
import { createIcons, MoreVertical, ChevronDown, User, Calendar, Upload, CheckCircle2, AlertCircle, Activity, ClipboardList } from 'lucide';

let unsubscribe = null;
let currentOrders = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架與統計卡片
    renderPageLayout({
      title: '流水線進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: `
        <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
          <i data-lucide="upload" class="w-4 h-4"></i>
          匯入 Excel
        </button>
        <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
      `,
      stats: [],
      controls: '',
      listContainerId: 'kanban-container'
    });

    // 2. 優先綁定按鈕事件
    const btnImport = document.getElementById('btn-import-excel');
    const fileInput = document.getElementById('excel-import-input');
    
    if (btnImport && fileInput) {
      btnImport.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        this.handleFileSelect(e);
      });
    }

    // 3. 渲染圖示
    createIcons({
      icons: { Upload },
      attrs: { class: 'w-4 h-4' }
    });

    // 4. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    let statuses = AppState.getStatuses();
    if (!statuses || statuses.length === 0) {
      statuses = ['排產中', '印刷', '裁切', '品檢', '出貨'];
    }

    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.renderKanban(orders, statuses);
    });
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

        // 呼叫解析器
        const parsedOrders = parseExcelData(headers, rows, salesMapping, currentStatuses[0], currentSchema);

        // 合併匯入邏輯（防覆寫手動資料）
        let addedCount = 0;
        let updatedCount = 0;

        for (const order of parsedOrders) {
          const existing = await getDocument('work_orders', order.id);
          
          if (existing) {
            // 如果已存在，僅更新 Excel 相關欄位，保留手動欄位（狀態、交期）
            await updateDocument('work_orders', order.id, {
              salesReps: order.salesReps,
              uploadDate: order.uploadDate,
              data: order.data
            });
            updatedCount++;
          } else {
            // 新工單，直接寫入
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

  renderKanban(orders, statuses) {
    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';
    const container = document.getElementById('kanban-container');
    if (!container) return;

    // 更新統計卡片
    const stats = calculateStats(orders, statuses);
    const statsContainer = container.parentElement.querySelector('.grid');
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
      createIcons({ 
        icons: { Activity, ClipboardList }, 
        attrs: { class: 'w-4 h-4' } 
      });
    }

    const grouped = groupByStatus(orders, statuses);

    const boardHtml = `
      <div class="flex gap-5 overflow-x-auto kanban-scroll pb-4 h-[calc(100vh-280px)]">
        ${statuses.map(status => {
          const statusOrders = grouped[status] || [];
          return `
            <div class="w-[85vw] sm:w-[300px] flex-shrink-0 flex flex-col gap-3">
              <div class="flex items-center justify-between px-1">
                <h3 class="font-semibold text-slate-700 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-brand"></span>
                  ${status}
                </h3>
                <span class="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">${statusOrders.length}</span>
              </div>
              
              <div class="inset-panel p-2 flex flex-col gap-2 flex-1 overflow-y-auto kanban-scroll" data-status="${status}">
                ${statusOrders.length === 0 ? `
                  <div class="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-10">
                    <i data-lucide="inbox" class="w-8 h-8 opacity-50"></i>
                    <span class="text-sm">目前無工單</span>
                  </div>
                ` : ''}

                ${statusOrders.map(order => this.renderCard(order, statuses, isAdmin)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = boardHtml;
    createIcons({
      icons: { MoreVertical, ChevronDown, User, Calendar, Upload, CheckCircle2, AlertCircle },
      attrs: { class: 'w-4 h-4' }
    });

    this.bindCardEvents(statuses);
  },

  renderCard(order, statuses, isAdmin) {
    const otherStatuses = statuses.filter(s => s !== order.status);
    const uploadDate = order.uploadDate ? order.uploadDate.split('T')[0] : '';
    const salesReps = order.salesReps ? order.salesReps.join(', ') : '未填寫';
    
    // 動態抓取客戶名稱（優先中文，其次英文），並過濾異常星號
    let customerName = order.data ? (order.data['customerNameZh'] || order.data['customerNameEn'] || '') : '';
    if (customerName.includes('***')) customerName = '';
    
    return `
      <div class="glass-card p-4 relative group card-item" data-id="${order.id}" data-current-status="${order.status}">
        <div class="flex justify-between items-start mb-2">
          <span class="font-bold text-slate-900">${order.id}</span>
          <span class="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-md">${uploadDate}</span>
        </div>
        
        <div class="flex flex-col gap-1.5 mb-3">
          ${customerName ? `<div class="text-sm text-slate-600">客戶：${customerName}</div>` : ''}
          <div class="flex items-center gap-1.5 text-xs text-slate-500">
            <i data-lucide="user" class="w-3.5 h-3.5"></i> ${salesReps}
          </div>
          ${order.dueDate ? `<div class="text-xs text-amber-600 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> 交期：${order.dueDate}</div>` : ''}
        </div>

        ${isAdmin ? `
          <div class="mt-3 pt-3 border-t border-slate-100">
            <button class="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-brand transition-colors btn-dropdown">
              <span>流轉工序</span>
              <i data-lucide="chevron-down" class="w-4 h-4 transition-transform"></i>
            </button>
            
            <div class="dropdown-menu hidden absolute left-0 right-0 top-full mt-1 bg-white border border-slate-100 shadow-soft rounded-xl p-1 z-10 mx-2">
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

  bindCardEvents(statuses) {
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
V: 1792911300
W: UPGRADE-002
═══ */