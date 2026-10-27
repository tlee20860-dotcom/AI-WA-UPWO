import * as XLSX from 'xlsx';
import { AppState } from '../config/state.js';
import { listenDocument, getDocument, getCollection } from '../db/read.js';
import { setDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { parseExcelData } from '../domain/parser.js';
import { createIcons, Upload, Plus, Trash2, GripVertical, FileSpreadsheet, Users, Tag, Shield, X, List, Database, Edit2, AlertCircle } from 'lucide';

let unsubscribe = null;
let currentSettings = { statuses: [], sales_mapping: [], users: [], schema: [] };
let activeTab = 'statuses'; // 'statuses', 'mapping', 'schema', 'users', 'data', 'import'

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
      subtitle: '管理工序狀態、銷售員對照表、系統欄位與帳號',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-container'
    });

    // 2. 優先渲染 UI 骨架
    this.renderTabs();

    // 3. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenDocument('settings', 'main', async (data) => {
      if (data) {
        currentSettings = {
          statuses: data.statuses || ['排產中'],
          sales_mapping: data.sales_mapping || [],
          users: data.users || [{ username: 'admin', password: '123456', role: 'admin' }],
          schema: data.schema || this.getDefaultSchema()
        };
      } else {
        currentSettings = {
          statuses: ['排產中', '印刷', '裁切', '品檢', '出貨'],
          sales_mapping: [],
          users: [{ username: 'admin', password: '123456', role: 'admin' }],
          schema: this.getDefaultSchema()
        };
        await setDocument('settings', 'main', currentSettings);
      }
      
      AppState.setStatuses(currentSettings.statuses);
      this.renderTabs();
    });
  },

  getDefaultSchema() {
    return [
      { key: 'id', label: '發票', type: 'string', isSystem: true },
      { key: 'uploadDate', label: '日期', type: 'date', isSystem: true },
      { key: 'salesRep', label: '我方備考', type: 'string', isSystem: true },
      { key: 'amount', label: '金額', type: 'number', isSystem: false },
      { key: 'customCategory', label: '類別', type: 'string', isSystem: false },
      { key: 'customerNameZh', label: '中文名稱', type: 'string', isSystem: false },
      { key: 'customerNameEn', label: '名稱', type: 'string', isSystem: false }
    ];
  },

  renderTabs() {
    const container = document.getElementById('settings-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
        
        <!-- 左側設定選單 -->
        <div class="w-full md:w-64 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 flex-shrink-0 overflow-y-auto">
          <button class="tab-btn ${activeTab === 'statuses' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="statuses">
            <i data-lucide="tag" class="w-4 h-4"></i> 狀態管理
          </button>
          <button class="tab-btn ${activeTab === 'mapping' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="mapping">
            <i data-lucide="users" class="w-4 h-4"></i> 對照表管理
          </button>
          <button class="tab-btn ${activeTab === 'schema' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="schema">
            <i data-lucide="list" class="w-4 h-4"></i> 欄位管理
          </button>
          <button class="tab-btn ${activeTab === 'users' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="users">
            <i data-lucide="shield" class="w-4 h-4"></i> 帳號管理
          </button>
          <div class="border-t border-slate-200/60 my-2"></div>
          <button class="tab-btn ${activeTab === 'data' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="data">
            <i data-lucide="database" class="w-4 h-4"></i> 資料管理
          </button>
          <button class="tab-btn ${activeTab === 'import' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="import">
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
      icons: { Tag, Users, Shield, FileSpreadsheet, List, Database },
      attrs: { class: 'w-4 h-4' }
    });

    this.bindTabEvents();
    this.renderContent();
  },

  bindTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTab = e.currentTarget.dataset.tab;
        this.renderTabs();
      });
    });
  },

  renderContent() {
    const content = document.getElementById('settings-content');
    if (!content) return;

    if (activeTab === 'statuses') this.renderStatuses(content);
    else if (activeTab === 'mapping') this.renderMapping(content);
    else if (activeTab === 'schema') this.renderSchema(content);
    else if (activeTab === 'users') this.renderUsers(content);
    else if (activeTab === 'data') this.renderDataManagement(content);
    else if (activeTab === 'import') this.renderImport(content);
  },

  // ═══════════ 狀態管理（含同步更新） ═══════════
  renderStatuses(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">工序狀態管理</h2>
          <p class="text-sm text-slate-500 mt-1">可拖曳排序。修改名稱時會同步更新歷史工單。</p>
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
          <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm status-item" draggable="true" data-index="${index}">
            <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
            <span class="flex-1 font-medium text-slate-700 status-name">${status}</span>
            <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-status" data-status="${status}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-status" data-status="${status}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, GripVertical, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-add-status')?.addEventListener('click', async () => {
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

    // 編輯狀態（同步更新歷史工單）
    document.querySelectorAll('.btn-edit-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const oldStatus = e.currentTarget.dataset.status;
        const newStatus = window.prompt(`修改狀態名稱（原為「${oldStatus}」）：`, oldStatus);
        
        if (!newStatus || newStatus.trim() === "" || newStatus === oldStatus) return;
        const trimmedNewStatus = newStatus.trim();

        showToast('正在更新狀態與歷史資料...', 'info');

        try {
          const idx = currentSettings.statuses.indexOf(oldStatus);
          if (idx !== -1) currentSettings.statuses[idx] = trimmedNewStatus;
          await this.saveSettings();

          const orders = await getCollection('work_orders');
          let updateCount = 0;
          for (const order of orders) {
            if (order.status === oldStatus) {
              await updateDocument('work_orders', order.id, { status: trimmedNewStatus });
              updateCount++;
            }
          }
          showToast(`已修改狀態，並同步更新 ${updateCount} 筆工單`, 'success');
        } catch (err) {
          console.error(err);
          showToast('修改失敗，請稍後再試', 'error');
        }
      });
    });

    document.querySelectorAll('.btn-del-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const status = e.currentTarget.dataset.status;
        const confirmed = await openConfirm({
          title: '刪除狀態',
          message: `確定要刪除「${status}」嗎？系統將檢查是否有工單處於此狀態。`,
          isDanger: true,
          confirmText: '檢查並刪除'
        });

        if (!confirmed) return;

        try {
          const orders = await getCollection('work_orders');
          const hasOrders = orders.some(o => o.status === status);
          
          if (hasOrders) {
            showToast(`無法刪除：仍有工單處於「${status}」狀態`, 'error');
            return;
          }

          currentSettings.statuses = currentSettings.statuses.filter(s => s !== status);
          await this.saveSettings();
          showToast('刪除成功', 'success');
        } catch (err) {
          showToast('檢查工單失敗', 'error');
        }
      });
    });

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
        const newOrder = Array.from(list.querySelectorAll('.status-item')).map(el => el.querySelector('.status-name').textContent);
        currentSettings.statuses = newOrder;
        const saveHandler = async () => {
          await this.saveSettings();
          showToast('排序已更新', 'success');
        };
        saveHandler.call(this);
      });
      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (this === draggedItem) return;
        const rect = this.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        list.insertBefore(draggedItem, next ? this.nextSibling : this);
      });
    });
  },

  // ═══════════ 對照表管理（含同步更新） ═══════════
  renderMapping(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">銷售員對照表</h2>
          <p class="text-sm text-slate-500 mt-1">設定別名，匯入時自動對應。修改後會自動同步歷史工單。</p>
        </div>
      </div>

      <div class="flex gap-2 mb-6">
        <input type="text" id="new-rep-name" class="w-1/3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="正式名稱 (例：王小明)">
        <input type="text" id="new-rep-alias" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="別名，用逗號隔開 (例：123, S-123)">
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
            <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-rep" data-index="${index}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-rep" data-index="${index}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-add-rep')?.addEventListener('click', async () => {
      const name = document.getElementById('new-rep-name').value.trim();
      const aliasStr = document.getElementById('new-rep-alias').value.trim();
      if (!name || !aliasStr) {
        showToast('請輸入正式名稱與至少一個別名', 'error');
        return;
      }
      
      const aliases = aliasStr.split(',').map(s => s.trim()).filter(Boolean);
      
      currentSettings.sales_mapping.push({ name, aliases });
      await this.saveSettings();

      showToast('正在同步歷史工單...', 'info');

      try {
        const orders = await getCollection('work_orders');
        let updateCount = 0;
        
        for (const order of orders) {
          let reps = order.salesReps || [];
          let changed = false;
          
          aliases.forEach(alias => {
            if (reps.includes(alias)) {
              reps = reps.filter(r => r !== alias);
              reps.push(name);
              changed = true;
            }
          });

          if (changed) {
            await updateDocument('work_orders', order.id, { salesReps: [...new Set(reps)] });
            updateCount++;
          }
        }
        showToast(`新增成功，同步更新了 ${updateCount} 筆工單`, 'success');
      } catch (err) {
        console.error(err);
        showToast('對照表已新增，但同步歷史資料失敗', 'error');
      }
    });

    // 編輯對照表
    document.querySelectorAll('.btn-edit-rep').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = e.currentTarget.dataset.index;
        const oldRep = currentSettings.sales_mapping[idx];
        
        const newName = window.prompt(`修改正式名稱（原為「${oldRep.name}」）：`, oldRep.name);
        if (!newName || newName.trim() === "" || newName === oldRep.name) return;
        const trimmedNewName = newName.trim();

        const newAliasStr = window.prompt(`修改別名（原為「${(oldRep.aliases||[]).join(', ')}」，請用逗號隔開）：`, (oldRep.aliases||[]).join(', '));
        if (newAliasStr === null) return; // 使用者按取消
        const newAliases = newAliasStr.split(',').map(s => s.trim()).filter(Boolean);

        showToast('正在更新設定與歷史資料...', 'info');

        try {
          currentSettings.sales_mapping[idx] = { name: trimmedNewName, aliases: newAliases };
          await this.saveSettings();

          // 同步歷史工單
          const orders = await getCollection('work_orders');
          let updateCount = 0;
          for (const order of orders) {
            let reps = order.salesReps || [];
            let changed = false;
            
            // 如果包含舊名稱，或者包含舊別名，都替換成新名稱
            if (reps.includes(oldRep.name)) {
              reps = reps.filter(r => r !== oldRep.name);
              reps.push(trimmedNewName);
              changed = true;
            }
            (oldRep.aliases || []).forEach(alias => {
              if (reps.includes(alias)) {
                reps = reps.filter(r => r !== alias);
                reps.push(trimmedNewName);
                changed = true;
              }
            });

            if (changed) {
              await updateDocument('work_orders', order.id, { salesReps: [...new Set(reps)] });
              updateCount++;
            }
          }
          showToast(`修改成功，同步更新了 ${updateCount} 筆工單`, 'success');
        } catch (err) {
          console.error(err);
          showToast('修改失敗，請稍後再試', 'error');
        }
      });
    });

    document.querySelectorAll('.btn-del-rep').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = e.currentTarget.dataset.index;
        currentSettings.sales_mapping.splice(idx, 1);
        await this.saveSettings();
        showToast('刪除成功（歷史資料保留原名稱）', 'success');
      });
    });
  },

  // ═══════════ 欄位管理 ═══════════
  renderSchema(container) {
    const sysFields = currentSettings.schema.filter(f => f.isSystem);
    const customFields = currentSettings.schema.filter(f => !f.isSystem);

    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">動態欄位管理</h2>
          <p class="text-sm text-slate-500 mt-1">定義系統欄位，並對應 Excel 表頭。系統核心欄位不可刪除。</p>
        </div>
      </div>

      <div class="flex gap-2 mb-6">
        <input type="text" id="new-field-label" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="新增欄位名稱 (例如：利潤)">
        <button id="btn-add-field" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>

      <div class="mb-4 text-sm font-semibold text-slate-600">系統核心欄位（不可刪除）</div>
      <div class="flex flex-col gap-2 mb-8">
        ${sysFields.map(f => `
          <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="w-1/3 font-bold text-slate-700">${f.label}</div>
            <div class="w-1/3 text-slate-400 font-mono text-xs">${f.key}</div>
            <div class="w-1/3 text-right text-slate-400 text-xs">系統保護</div>
          </div>
        `).join('')}
      </div>

      <div class="mb-4 text-sm font-semibold text-slate-600">自訂欄位</div>
      <div class="flex flex-col gap-2">
        ${customFields.length === 0 ? '<div class="text-slate-400 text-sm py-2">目前尚無自訂欄位</div>' : ''}
        ${customFields.map((f, index) => `
          <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <div class="w-1/3 font-bold text-slate-800">${f.label}</div>
            <div class="w-1/3 text-slate-500 font-mono text-xs">${f.key}</div>
            <div class="w-1/3 flex justify-end gap-2">
              <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-field" data-key="${f.key}" data-label="${f.label}">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-field" data-key="${f.key}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-add-field')?.addEventListener('click', async () => {
      const input = document.getElementById('new-field-label');
      const val = input.value.trim();
      if (!val) {
        showToast('請輸入欄位名稱', 'error');
        return;
      }
      const key = 'field_' + Date.now().toString(36);
      currentSettings.schema.push({ key, label: val, type: 'string', isSystem: false });
      await this.saveSettings();
      showToast('新增成功', 'success');
    });

    document.querySelectorAll('.btn-edit-field').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        const oldLabel = e.currentTarget.dataset.label;
        const newLabel = window.prompt(`修改欄位名稱（原為「${oldLabel}」）：`, oldLabel);
        
        if (!newLabel || newLabel.trim() === "" || newLabel === oldLabel) return;
        
        const idx = currentSettings.schema.findIndex(f => f.key === key);
        if (idx !== -1) {
          currentSettings.schema[idx].label = newLabel.trim();
          await this.saveSettings();
          showToast('修改成功', 'success');
        }
      });
    });

    document.querySelectorAll('.btn-del-field').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        const confirmed = await openConfirm({
          title: '刪除自訂欄位',
          message: `確定要刪除該欄位嗎？(歷史資料將保留，僅不再顯示)`,
          isDanger: true
        });
        if (!confirmed) return;
        currentSettings.schema = currentSettings.schema.filter(f => f.key !== key);
        await this.saveSettings();
        showToast('已刪除欄位', 'success');
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

    document.getElementById('btn-add-user')?.addEventListener('click', async () => {
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

  // ═══════════ 資料管理 ═══════════
  renderDataManagement(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">資料管理</h2>
          <p class="text-sm text-slate-500 mt-1">清除由 Excel 匯入的資料，保留您手動輸入的狀態與交期。</p>
        </div>
      </div>

      <div class="bg-rose-50 border border-rose-200 rounded-2xl p-6">
        <h3 class="text-rose-700 font-bold mb-2 flex items-center gap-2">
          <i data-lucide="alert-circle" class="w-5 h-5"></i> 危險操作區
        </h3>
        <p class="text-sm text-rose-600 mb-4">
          點擊下方按鈕將會清空所有工單中「由 Excel 匯入」的資料（如金額、類別、客戶名稱等），但<b>絕對不會</b>刪除工單號碼、當前狀態、交期與狀態更新日。清空後，您可以重新匯入新的 Excel，系統會自動將新資料與您手動填寫的狀態合併對齊。
        </p>
        <button id="btn-clear-excel-data" class="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
          <i data-lucide="trash-2" class="w-4 h-4"></i> 清空 Excel 匯入資料
        </button>
      </div>
    `;

    createIcons({ icons: { Trash2, AlertCircle }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-clear-excel-data')?.addEventListener('click', async () => {
      const confirmed = await openConfirm({
        title: '清空 Excel 資料',
        message: '確定要清空所有工單的 Excel 資料嗎？此操作無法復原，但您手動填寫的狀態與交期會保留。',
        isDanger: true,
        confirmText: '確認清空'
      });

      if (!confirmed) return;

      showToast('正在清空資料...', 'info');

      try {
        const orders = await getCollection('work_orders');
        let count = 0;
        
        for (const order of orders) {
          await updateDocument('work_orders', order.id, {
            salesReps: ["未填寫"],
            uploadDate: "",
            data: { category: order.data?.category || '' }
          });
          count++;
        }

        showToast(`成功清空 ${count} 筆工單的 Excel 資料`, 'success');
      } catch (error) {
        console.error('Clear data error:', error);
        showToast('清空失敗，請稍後再試', 'error');
      }
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
        <p class="text-sm text-slate-500 max-w-sm">系統將會依據「欄位管理」中的設定，自動解析 Excel 標題並存入資料庫。若單號已存在，將會更新 Excel 資料並保留手動狀態。</p>
      </div>
    `;

    createIcons({ icons: { FileSpreadsheet }, attrs: { class: 'w-8 h-8' } });

    const fileInput = document.getElementById('excel-input');
    
    fileInput?.addEventListener('change', async (e) => {
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

          const parsedOrders = parseExcelData(headers, rows, currentSettings.sales_mapping, currentSettings.statuses[0] || '排產中', currentSettings.schema);

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
          fileInput.value = ''; 

        } catch (error) {
          console.error('Import Error:', error);
          showToast(`匯入失敗：${error.message || '請檢查檔案格式'}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  async saveSettings() {
    await setDocument('settings', 'main', currentSettings);
    this.renderTabs();
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/settings.js
V: 1792912900
W: UPGRADE-002
═══ */