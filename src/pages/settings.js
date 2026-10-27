import * as XLSX from 'xlsx';
import { AppState } from '../config/state.js';
import { listenDocument, getDocument } from '../db/read.js';
import { setDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { parseExcelData } from '../domain/parser.js';
import { createIcons, Upload, Plus, Trash2, GripVertical, FileSpreadsheet, Users, Tag, Shield, X } from 'lucide';

let unsubscribe = null;
let currentSettings = { statuses: [], sales_mapping: [], users: [] };
let currentOrders = [];
let activeTab = 'statuses'; // 'statuses', 'mapping', 'users', 'import'

export default {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '系統設定',
      subtitle: '管理工序狀態、銷售員對照表與系統帳號',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-container'
    });

    this.initDataListener();
  },

  initDataListener() {
    // 監聽 settings/main 設定檔
    unsubscribe = listenDocument('settings', 'main', async (data) => {
      if (data) {
        currentSettings = {
          statuses: data.statuses || ['排產中'],
          sales_mapping: data.sales_mapping || [],
          users: data.users || [{ username: 'admin', password: '123456', role: 'admin' }]
        };
      } else {
        // 初始化預設設定
        currentSettings = {
          statuses: ['排產中', '印刷', '裁切', '品檢', '出貨'],
          sales_mapping: [],
          users: [{ username: 'admin', password: '123456', role: 'admin' }]
        };
        await setDocument('settings', 'main', currentSettings);
      }
      
      // 更新 AppState 中的狀態（讓其他頁面能即時讀取）
      AppState.setStatuses(currentSettings.statuses);

      // 同步抓取工單資料（用於刪除狀態時的檢查）
      const orders = await getDocument('settings', 'dummy'); // 這裡只是借用非同步
      
      this.renderTabs();
    });
  },

  renderTabs() {
    const container = document.getElementById('settings-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
        
        <!-- 左側設定選單 -->
        <div class="w-full md:w-64 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 flex-shrink-0">
          <button class="tab-btn ${activeTab === 'statuses' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="statuses">
            <i data-lucide="tag" class="w-4 h-4"></i> 狀態管理
          </button>
          <button class="tab-btn ${activeTab === 'mapping' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="mapping">
            <i data-lucide="users" class="w-4 h-4"></i> 對照表管理
          </button>
          <button class="tab-btn ${activeTab === 'users' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="users">
            <i data-lucide="shield" class="w-4 h-4"></i> 帳號管理
          </button>
          <button class="tab-btn ${activeTab === 'import' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3 mt-4" data-tab="import">
            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> 匯入 Excel
          </button>
        </div>

        <!-- 右側內容區 -->
        <div class="flex-1 p-6 md:p-8" id="settings-content">
          <!-- 由 renderContent 注入 -->
        </div>
      </div>
    `;

    createIcons({
      icons: { Tag, Users, Shield, FileSpreadsheet },
      attrs: { class: 'w-4 h-4' }
    });

    this.bindTabEvents();
    this.renderContent();
  },

  bindTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTab = e.currentTarget.dataset.tab;
        this.renderTabs(); // 重新渲染以更新 active 樣式
      });
    });
  },

  renderContent() {
    const content = document.getElementById('settings-content');
    if (!content) return;

    if (activeTab === 'statuses') {
      this.renderStatuses(content);
    } else if (activeTab === 'mapping') {
      this.renderMapping(content);
    } else if (activeTab === 'users') {
      this.renderUsers(content);
    } else if (activeTab === 'import') {
      this.renderImport(content);
    }
  },

  // ═══════════ 狀態管理 ═══════════
  renderStatuses(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">工序狀態管理</h2>
          <p class="text-sm text-slate-500 mt-1">可拖曳排序，刪除時會檢查是否有工單使用中。</p>
        </div>
      </div>
      
      <div class="flex gap-2 mb-6">
        <input type="text" id="new-status-input" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="輸入新狀態名稱...">
        <button id="btn-add-status" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>

      <div class="inset-panel p-4 flex flex-col gap-2" id="status-list">
        ${currentSettings.statuses.map((status, index) => `
          <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm cursor-move status-item" draggable="true" data-index="${index}">
            <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
            <span class="flex-1 font-medium text-slate-700">${status}</span>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-status" data-status="${status}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, GripVertical, Trash2 }, attrs: { class: 'w-4 h-4' } });

    // 新增狀態
    document.getElementById('btn-add-status').addEventListener('click', async () => {
      const input = document.getElementById('new-status-input');
      const val = input.value.trim();
      if (!val) return;
      if (currentSettings.statuses.includes(val)) {
        showToast('狀態已存在', 'error');
        return;
      }
      currentSettings.statuses.push(val);
      await this.saveSettings();
      showToast('新增成功', 'success');
    });

    // 刪除狀態
    document.querySelectorAll('.btn-del-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const status = e.currentTarget.dataset.status;
        
        // 檢查是否有工單使用此狀態
        // 由於需要精確檢查，這裡先借用全域的 listenCollection 資料，若無則臨時抓取
        // 簡化處理：直接向資料庫查詢（或依賴之前載入的資料，但設定頁可能沒載入 orders）
        const confirmed = await openConfirm({
          title: '刪除狀態',
          message: `確定要刪除「${status}」嗎？系統將檢查是否有工單處於此狀態。`,
          isDanger: true,
          confirmText: '檢查並刪除'
        });

        if (!confirmed) return;

        // 檢查工單
        import('../db/read.js').then(async ({ getCollection }) => {
          const orders = await getCollection('work_orders');
          const hasOrders = orders.some(o => o.status === status);
          
          if (hasOrders) {
            showToast(`無法刪除：仍有工單處於「${status}」狀態`, 'error');
            return;
          }

          // 執行刪除
          currentSettings.statuses = currentSettings.statuses.filter(s => s !== status);
          await this.saveSettings();
          showToast('刪除成功', 'success');
        });
      });
    });

    // 拖曳排序邏輯
    this.initDragAndDrop();
  },

  initDragAndDrop() {
    const list = document.getElementById('status-list');
    if (!list) return;

    let draggedItem = null;

    list.querySelectorAll('.status-item').forEach(item => {
      item.addEventListener('dragstart', function() {
        draggedItem = this;
        setTimeout(() => this.classList.add('opacity-50'), 0);
      });

      item.addEventListener('dragend', function() {
        this.classList.remove('opacity-50');
        draggedItem = null;
        // 取得排序後的結果並儲存
        const newOrder = Array.from(list.querySelectorAll('.status-item')).map(el => el.querySelector('span').textContent);
        currentSettings.statuses = newOrder;
        window.dispatchEvent(new CustomEvent('save-settings-drag'));
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (this === draggedItem) return;
        
        const rect = this.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        list.insertBefore(draggedItem, next ? this.nextSibling : this);
      });
    });

    // 綁定拖曳結束的儲存事件
    const saveHandler = async () => {
      window.removeEventListener('save-settings-drag', saveHandler);
      await this.saveSettings();
      showToast('排序已更新', 'success');
    };
    window.addEventListener('save-settings-drag', saveHandler);
  },

  // ═══════════ 對照表管理 ═══════════
  renderMapping(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">銷售員對照表</h2>
          <p class="text-sm text-slate-500 mt-1">設定別名，讓 Excel 匯入時能正確對應。</p>
        </div>
      </div>

      <div class="flex gap-2 mb-6">
        <input type="text" id="new-rep-name" class="w-1/3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="正式名稱 (例：王小明)">
        <input type="text" id="new-rep-alias" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="別名，多個請用逗號隔開 (例：123, S-123)">
        <button id="btn-add-rep" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>

      <div class="flex flex-col gap-2">
        ${currentSettings.sales_mapping.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無對照表資料</div>' : ''}
        ${currentSettings.sales_mapping.map((rep, index) => `
          <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <div class="w-1/3 font-bold text-slate-800">${rep.name}</div>
            <div class="flex-1 flex flex-wrap gap-1">
              ${(rep.aliases || []).map(a => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${a}</span>`).join('')}
            </div>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-rep" data-index="${index}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, Trash2 }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-add-rep').addEventListener('click', async () => {
      const name = document.getElementById('new-rep-name').value.trim();
      const aliasStr = document.getElementById('new-rep-alias').value.trim();
      if (!name) {
        showToast('請輸入正式名稱', 'error');
        return;
      }
      
      const aliases = aliasStr ? aliasStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      
      currentSettings.sales_mapping.push({ name, aliases });
      await this.saveSettings();
      showToast('新增成功', 'success');
    });

    document.querySelectorAll('.btn-del-rep').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = e.currentTarget.dataset.index;
        currentSettings.sales_mapping.splice(idx, 1);
        await this.saveSettings();
        showToast('刪除成功', 'success');
      });
    });
  },

  // ═══════════ 帳號管理 ═══════════
  renderUsers(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">帳號管理</h2>
          <p class="text-sm text-slate-500 mt-1">設定登入系統的帳號與角色。</p>
        </div>
      </div>

      <div class="flex gap-2 mb-6">
        <input type="text" id="new-user-name" class="w-1/3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="帳號">
        <input type="text" id="new-user-pass" class="w-1/3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="密碼">
        <select id="new-user-role" class="w-1/6 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none">
          <option value="user">一般使用者</option>
          <option value="admin">管理員</option>
        </select>
        <button id="btn-add-user" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>

      <div class="flex flex-col gap-2">
        ${currentSettings.users.map((u, index) => `
          <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <div class="w-1/3 font-bold text-slate-800">${u.username}</div>
            <div class="w-1/3 text-slate-500 font-mono text-sm">••••••••</div>
            <div class="w-1/6">
              <span class="px-2 py-1 text-xs font-medium rounded-md ${u.role === 'admin' ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-600'}">${u.role}</span>
            </div>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-user" data-index="${index}" ${u.username === 'admin' ? 'disabled title="無法刪除預設 admin"' : ''}>
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, Trash2 }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-add-user').addEventListener('click', async () => {
      const name = document.getElementById('new-user-name').value.trim();
      const pass = document.getElementById('new-user-pass').value.trim();
      const role = document.getElementById('new-user-role').value;
      
      if (!name || !pass) {
        showToast('請填寫帳號與密碼', 'error');
        return;
      }
      if (currentSettings.users.some(u => u.username === name)) {
        showToast('帳號已存在', 'error');
        return;
      }
      
      currentSettings.users.push({ username: name, password: pass, role });
      await this.saveSettings();
      showToast('新增成功', 'success');
    });

    document.querySelectorAll('.btn-del-user').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const idx = e.currentTarget.dataset.index;
        currentSettings.users.splice(idx, 1);
        await this.saveSettings();
        showToast('刪除成功', 'success');
      });
    });
  },

  // ═══════════ 匯入 Excel ═══════════
  renderImport(container) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-8 text-center transition-colors hover:bg-slate-50 relative" id="drop-zone">
        <input type="file" id="excel-input" accept=".xlsx, .xls" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-brand">
          <i data-lucide="file-spreadsheet" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">點擊或拖曳 Excel 檔案至此</h3>
        <p class="text-sm text-slate-500 max-w-sm">系統將會自動解析 A 欄(單號) 與 G 欄(銷售員)，並存入資料庫。若單號已存在，則會自動跳過。</p>
      </div>
    `;

    createIcons({ icons: { FileSpreadsheet }, attrs: { class: 'w-8 h-8' } });

    const fileInput = document.getElementById('excel-input');
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // 轉成 array of arrays
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (jsonData.length < 2) {
            showToast('Excel 檔案沒有資料', 'error');
            return;
          }

          const headers = jsonData[0];
          const rows = jsonData.slice(1);

          showToast('解析中，請稍候...', 'info');

          // 呼叫 domain/parser.js 進行解析
          const parsedOrders = parseExcelData(headers, rows, currentSettings.sales_mapping, currentSettings.statuses[0] || '排產中');

          // 防覆寫檢查與寫入
          let addedCount = 0;
          let skippedCount = 0;

          for (const order of parsedOrders) {
            const existing = await getDocument('work_orders', order.id);
            if (existing) {
              skippedCount++;
            } else {
              await setDocument('work_orders', order.id, order);
              addedCount++;
            }
          }

          showToast(`匯入完成！新增 ${addedCount} 筆，跳過 ${skippedCount} 筆重複單號。`, 'success');
          fileInput.value = ''; // 清空 input

        } catch (error) {
          console.error('Import Error:', error);
          showToast('匯入失敗，請檢查檔案格式', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  async saveSettings() {
    await setDocument('settings', 'main', currentSettings);
    this.renderTabs(); // 重新渲染以更新畫面
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
};

/* ═══ EOF ═══
F: src/pages/settings.js
V: 1792903516
W: webapp-20261026-001#28
═══ */