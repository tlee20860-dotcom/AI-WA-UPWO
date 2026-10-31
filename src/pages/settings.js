import * as XLSX from 'xlsx';
import { AppState } from '../config/state.js';
import { listenDocument, getDocument, getCollection } from '../db/read.js';
import { setDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { parseExcelData } from '../domain/parser.js';
import { createIcons, Upload, Plus, Trash2, GripVertical, FileSpreadsheet, Users, Tag, Shield, X, List, Database, Edit2, AlertCircle, LayoutDashboard, Table, PieChart, Layers, Check, MapPin, Activity } from 'lucide';

// 引入拆分出去的模組
import { renderStatuses, renderMapping, renderRouteTemplates } from './settings-basic.js';
import { renderSchema, renderViewConfig } from './settings-schema.js';
import { renderAreas } from './settings-area.js';
import { renderCategories } from './settings-category.js';
import { renderAreaStatuses } from './settings-area-status.js';

let unsubscribe = null;
export let currentSettings = { statuses: [], sales_mapping: [], users: [], schema: [], view_configs: {}, route_templates: [], areas: [], categories: [], areaStatuses: [] };
let activeTab = 'statuses';
let allSalesReps = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }

    // 預先抓取所有銷售員名單，供帳號管理勾選使用
    try {
      const orders = await getCollection('work_orders');
      const reps = new Set();
      orders.forEach(o => {
        (o.salesReps || []).forEach(r => {
          if (r && r !== '未填寫') reps.add(r);
        });
      });
      allSalesReps = Array.from(reps).sort();
    } catch (e) {
      console.warn('無法取得銷售員名單', e);
    }

    renderPageLayout({
      title: '系統設定',
      subtitle: '管理工序、類別、區域、銷售員對照表、系統欄位與帳號',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-container'
    });

    this.renderTabs();
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenDocument('settings', 'main', async (data) => {
      let needSave = false;
      if (data) {
        currentSettings = {
          statuses: data.statuses || ['排產中'],
          sales_mapping: data.sales_mapping || [],
          users: data.users || [{ username: 'admin', password: '123456', role: 'admin', allowedAreas: [], allowedSales: [] }],
          schema: data.schema || this.getDefaultSchema(),
          view_configs: data.view_configs || this.getDefaultViewConfigs(),
          route_templates: data.route_templates || this.getDefaultRouteTemplates(data.statuses || ['排產中']),
          areas: Array.isArray(data.areas) ? data.areas : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          areaStatuses: Array.isArray(data.areaStatuses) ? data.areaStatuses : ['正常', '壞機', '休息中']
        };

        // 遷移：areas 不存在
        if (!Array.isArray(data.areas)) needSave = true;
        
        // 遷移：areaStatuses 不存在
        if (!Array.isArray(data.areaStatuses)) needSave = true;

        // 遷移：每個使用者補 allowedAreas, allowedSales 欄位，並升級舊角色
        currentSettings.users.forEach(u => {
          if (!Array.isArray(u.allowedAreas)) {
            u.allowedAreas = [];
            needSave = true;
          }
          if (!Array.isArray(u.allowedSales)) {
            u.allowedSales = [];
            needSave = true;
          }
          if (u.role === 'user') {
            u.role = 'viewer'; // 將舊的 user 角色升級為一般使用者
            needSave = true;
          }
        });

        // 遷移：如果 categories 是空的，掃描工單自動補齊
        if (!Array.isArray(data.categories) || data.categories.length === 0) {
          try {
            const orders = await getCollection('work_orders');
            const cats = new Set();
            orders.forEach(o => {
              let c = '';
              if (o.data && o.data.category) c = String(o.data.category).toUpperCase();
              else {
                const match = String(o.id).match(/^[a-zA-Z]+/);
                c = match ? match[0].toUpperCase() : '其他';
              }
              if (c && c !== '其他') cats.add(c);
            });
            if (cats.size > 0) {
              currentSettings.categories = Array.from(cats).sort();
              needSave = true;
            }
          } catch (e) {
            console.warn('自動掃描類別失敗', e);
          }
        }

        // 自動補齊核心欄位
        const requiredSysFields = [
          { key: 'id', label: '發票', type: 'string', isSystem: true, isEditable: false },
          { key: 'uploadDate', label: '日期', type: 'date', isSystem: true, isEditable: false },
          { key: 'salesRep', label: '我方備考', type: 'string', isSystem: true, isEditable: true },
          { key: 'status', label: '生產進度', type: 'string', isSystem: true, isEditable: false },
          { key: 'dueDate', label: '交貨日期', type: 'date', isSystem: true, isEditable: true },
          { key: 'statusUpdateDate', label: '更新日期', type: 'date', isSystem: true, isEditable: false },
          { key: 'route', label: '製程路線', type: 'string', isSystem: true, isEditable: false }
        ];

        requiredSysFields.forEach(req => {
          if (!currentSettings.schema.some(f => f.key === req.key)) {
            currentSettings.schema.push(req);
            needSave = true;
          }
        });

        if (!currentSettings.view_configs['overview']) {
          currentSettings.view_configs['overview'] = ['id', 'status', 'salesRep', 'dueDate'];
          needSave = true;
        }

        // 資料遷移與修復
        currentSettings.route_templates.forEach(t => {
          if (t.category === undefined) {
            t.category = '';
            needSave = true;
          }
          if ((t.category === '' || t.category === '通用') && (!t.steps || t.steps.length === 0)) {
            t.steps = Array.from(currentSettings.statuses);
            needSave = true;
          }
        });

        if (!currentSettings.route_templates.some(t => t.category === '' || t.category === '通用')) {
          currentSettings.route_templates.unshift({
            name: '預設常規路線',
            category: '',
            steps: Array.from(currentSettings.statuses)
          });
          needSave = true;
        }

      } else {
        currentSettings = {
          statuses: ['排產中', '印刷', '裁切', '品檢', '出貨'],
          sales_mapping: [],
          users: [{ username: 'admin', password: '123456', role: 'admin', allowedAreas: [], allowedSales: [] }],
          schema: this.getDefaultSchema(),
          view_configs: this.getDefaultViewConfigs(),
          route_templates: this.getDefaultRouteTemplates(),
          areas: [],
          categories: [],
          areaStatuses: ['正常', '壞機', '休息中']
        };
        needSave = true;
      }

      if (needSave) {
        await setDocument('settings', 'main', currentSettings);
      }

      AppState.setStatuses(currentSettings.statuses);
      this.renderTabs();
    });
  },

  getDefaultSchema() {
    return [
      { key: 'id', label: '發票', type: 'string', isSystem: true, isEditable: false },
      { key: 'uploadDate', label: '日期', type: 'date', isSystem: true, isEditable: false },
      { key: 'salesRep', label: '我方備考', type: 'string', isSystem: true, isEditable: true },
      { key: 'status', label: '生產進度', type: 'string', isSystem: true, isEditable: false },
      { key: 'dueDate', label: '交貨日期', type: 'date', isSystem: true, isEditable: true },
      { key: 'statusUpdateDate', label: '更新日期', type: 'date', isSystem: true, isEditable: false },
      { key: 'route', label: '製程路線', type: 'string', isSystem: true, isEditable: false },
      { key: 'amount', label: '金額', type: 'number', isSystem: false, isEditable: true },
      { key: 'customCategory', label: '類別', type: 'string', isSystem: false, isEditable: true },
      { key: 'customerNameZh', label: '中文名稱', type: 'string', isSystem: false, isEditable: true },
      { key: 'customerNameEn', label: '名稱', type: 'string', isSystem: false, isEditable: true }
    ];
  },

  getDefaultRouteTemplates(statuses = ['排產中', '印刷', '裁切', '品檢', '出貨']) {
    return [
      { name: '預設常規路線', category: '', steps: Array.from(statuses) }
    ];
  },

  getDefaultViewConfigs() {
    return {
      kanban: ['id', 'status', 'customerNameZh', 'salesRep', 'dueDate'],
      table: ['id', 'customCategory', 'status', 'uploadDate', 'dueDate', 'amount', 'customerNameZh', 'customerNameEn'],
      category: ['id', 'customCategory', 'status', 'dueDate'],
      salesperson: ['id', 'customCategory', 'status', 'dueDate'],
      overview: ['id', 'status', 'salesRep', 'dueDate']
    };
  },

  renderTabs() {
    const container = document.getElementById('settings-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
        
        <div class="w-full md:w-64 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 flex-shrink-0 overflow-y-auto">
          <button class="tab-btn ${activeTab === 'statuses' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="statuses">
            <i data-lucide="tag" class="w-4 h-4"></i> 狀態管理
          </button>
          <button class="tab-btn ${activeTab === 'categories' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="categories">
            <i data-lucide="layers" class="w-4 h-4"></i> 類別管理
          </button>
          <button class="tab-btn ${activeTab === 'route_templates' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="route_templates">
            <i data-lucide="git-branch" class="w-4 h-4"></i> 製程模板
          </button>
          <button class="tab-btn ${activeTab === 'areas' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="areas">
            <i data-lucide="map-pin" class="w-4 h-4"></i> 區域管理
          </button>
          <button class="tab-btn ${activeTab === 'area_statuses' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="area_statuses">
            <i data-lucide="activity" class="w-4 h-4"></i> 區域狀態
          </button>
          <button class="tab-btn ${activeTab === 'mapping' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="mapping">
            <i data-lucide="users" class="w-4 h-4"></i> 對照表管理
          </button>
          <button class="tab-btn ${activeTab === 'schema' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="schema">
            <i data-lucide="list" class="w-4 h-4"></i> 欄位管理
          </button>
          
          <div class="border-t border-slate-200/60 my-2"></div>
          
          <button class="tab-btn ${activeTab === 'view_config' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="view_config">
            <i data-lucide="layout-dashboard" class="w-4 h-4"></i> 視圖配置
          </button>
          
          <div class="border-t border-slate-200/60 my-2"></div>
          
          <button class="tab-btn ${activeTab === 'users' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="users">
            <i data-lucide="shield" class="w-4 h-4"></i> 帳號管理
          </button>
          <button class="tab-btn ${activeTab === 'data' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="data">
            <i data-lucide="database" class="w-4 h-4"></i> 資料管理
          </button>
          <button class="tab-btn ${activeTab === 'import' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="import">
            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> 匯入 Excel
          </button>
        </div>

        <div class="flex-1 p-6 md:p-8" id="settings-content"></div>
      </div>
    `;

    createIcons({
      icons: { Tag, Users, Shield, FileSpreadsheet, List, Database, LayoutDashboard, Layers, MapPin, Activity },
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

    if (activeTab === 'statuses') {
      renderStatuses(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'categories') {
      renderCategories(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'route_templates') {
      renderRouteTemplates(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'areas') {
      renderAreas(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'area_statuses') {
      renderAreaStatuses(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'mapping') {
      renderMapping(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'schema') {
      renderSchema(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'view_config') {
      renderViewConfig(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'users') {
      this.renderUsers(content);
    } else if (activeTab === 'data') {
      this.renderDataManagement(content);
    } else if (activeTab === 'import') {
      this.renderImport(content);
    }
  },

  renderUsers(container) {
    const areas = currentSettings.areas || [];

    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">帳號管理</h2>
          <p class="text-sm text-slate-500 mt-1">設定登入系統的帳號、角色與可見範圍。</p>
        </div>
      </div>

      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 flex flex-col gap-3">
        <div class="text-sm font-semibold text-slate-700">新增帳號</div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="text" id="new-user-name" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="帳號">
          <input type="text" id="new-user-pass" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="密碼">
          <select id="new-user-role" class="w-full sm:w-40 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none font-medium">
            <option value="admin">管理員</option>
            <option value="worker">生產員</option>
            <option value="sales">銷售員</option>
            <option value="viewer">一般使用者</option>
          </select>
        </div>
        
        <div id="new-user-areas-wrapper" class="hidden flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-600">可見區域（不勾選 = 全部區域）</label>
          <div class="flex flex-wrap gap-2">
            ${areas.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何區域</span>' : ''}
            ${areas.map(a => `
              <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                <input type="checkbox" class="new-user-area-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${a.id}">
                <span class="text-slate-700">${a.name}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div id="new-user-sales-wrapper" class="hidden flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-600">可見銷售員（不勾選 = 全部銷售員）</label>
          <div class="flex flex-wrap gap-2">
            ${allSalesReps.length === 0 ? '<span class="text-xs text-slate-400">目前無銷售員資料</span>' : ''}
            ${allSalesReps.map(s => `
              <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                <input type="checkbox" class="new-user-sales-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${s}">
                <span class="text-slate-700">${s}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="flex justify-end mt-2">
          <button id="btn-add-user" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <i data-lucide="plus" class="w-4 h-4"></i> 新增帳號
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        ${currentSettings.users.map((u, index) => {
          const uAreas = Array.isArray(u.allowedAreas) ? u.allowedAreas : [];
          const uSales = Array.isArray(u.allowedSales) ? u.allowedSales : [];
          
          const areaLabels = uAreas.map(id => {
            const a = areas.find(x => x.id === id);
            return a ? a.name : id;
          });

          let roleText = '一般使用者';
          let roleColor = 'bg-slate-100 text-slate-600';
          if (u.role === 'admin') { roleText = '管理員'; roleColor = 'bg-brand/10 text-brand'; }
          if (u.role === 'worker') { roleText = '生產員'; roleColor = 'bg-orange-100 text-orange-600'; }
          if (u.role === 'sales') { roleText = '銷售員'; roleColor = 'bg-emerald-100 text-emerald-600'; }

          return `
            <div class="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div class="w-full md:w-1/4 font-bold text-slate-800">${u.username}</div>
              <div class="w-full md:w-1/4 text-slate-500 font-mono text-sm">••••••••</div>
              <div class="w-full md:w-1/6">
                <span class="px-2 py-1 text-xs font-medium rounded-md ${roleColor}">${roleText}</span>
              </div>
              <div class="flex-1 flex flex-wrap gap-1">
                ${u.role === 'admin' || u.role === 'viewer'
                  ? '<span class="text-xs text-slate-400">不受限制</span>'
                  : (u.role === 'worker' 
                      ? (uAreas.length === 0 ? '<span class="text-xs text-slate-400">全區可見</span>' : areaLabels.map(l => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${l}</span>`).join(''))
                      : (uSales.length === 0 ? '<span class="text-xs text-slate-400">全銷售員可見</span>' : uSales.map(s => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${s}</span>`).join(''))
                    )
                }
              </div>
              <div class="flex items-center gap-1 justify-end">
                <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-user" data-index="${index}">
                  <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-user" data-index="${index}" ${u.username === 'admin' ? 'disabled title="無法刪除預設 admin"' : ''}>
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

    // 新增角色連動顯示
    document.getElementById('new-user-role')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const areasWrap = document.getElementById('new-user-areas-wrapper');
      const salesWrap = document.getElementById('new-user-sales-wrapper');
      
      if (val === 'worker') {
        areasWrap.classList.remove('hidden'); areasWrap.classList.add('flex');
        salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
      } else if (val === 'sales') {
        salesWrap.classList.remove('hidden'); salesWrap.classList.add('flex');
        areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
      } else {
        areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
        salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
      }
    });

    // 新增使用者
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

      let allowedAreas = [];
      let allowedSales = [];
      
      if (role === 'worker') {
        allowedAreas = Array.from(document.querySelectorAll('.new-user-area-checkbox:checked')).map(cb => cb.value);
      } else if (role === 'sales') {
        allowedSales = Array.from(document.querySelectorAll('.new-user-sales-checkbox:checked')).map(cb => cb.value);
      }

      currentSettings.users.push({ username: name, password: pass, role, allowedAreas, allowedSales });
      await this.saveSettings();
      showToast('新增成功', 'success');
    });

    // 刪除使用者
    document.querySelectorAll('.btn-del-user').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const idx = e.currentTarget.dataset.index;
        currentSettings.users.splice(idx, 1);
        await this.saveSettings();
        showToast('刪除成功', 'success');
      });
    });

    // 編輯使用者
    document.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const user = currentSettings.users[idx];
        const userAreas = Array.isArray(user.allowedAreas) ? user.allowedAreas : [];
        const userSales = Array.isArray(user.allowedSales) ? user.allowedSales : [];

        const content = `
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-slate-700">帳號</label>
              <input type="text" id="edit-user-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" value="${user.username}" ${user.username === 'admin' ? 'disabled' : ''}>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-slate-700">密碼</label>
              <input type="text" id="edit-user-pass" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" value="${user.password}">
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-slate-700">角色</label>
              <select id="edit-user-role" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none font-medium" ${user.username === 'admin' ? 'disabled' : ''}>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理員</option>
                <option value="worker" ${user.role === 'worker' ? 'selected' : ''}>生產員</option>
                <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>銷售員</option>
                <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>一般使用者</option>
              </select>
            </div>
            
            <div id="edit-user-areas-wrapper" class="flex-col gap-1.5 ${user.role === 'worker' ? 'flex' : 'hidden'}">
              <label class="text-sm font-medium text-slate-700">可見區域（不勾選 = 全部區域）</label>
              <div class="flex flex-wrap gap-2">
                ${areas.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何區域</span>' : ''}
                ${areas.map(a => `
                  <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                    <input type="checkbox" class="edit-user-area-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${a.id}" ${userAreas.includes(a.id) ? 'checked' : ''}>
                    <span class="text-slate-700">${a.name}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div id="edit-user-sales-wrapper" class="flex-col gap-1.5 ${user.role === 'sales' ? 'flex' : 'hidden'}">
              <label class="text-sm font-medium text-slate-700">可見銷售員（不勾選 = 全部銷售員）</label>
              <div class="flex flex-wrap gap-2">
                ${allSalesReps.length === 0 ? '<span class="text-xs text-slate-400">目前無銷售員資料</span>' : ''}
                ${allSalesReps.map(s => `
                  <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                    <input type="checkbox" class="edit-user-sales-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${s}" ${userSales.includes(s) ? 'checked' : ''}>
                    <span class="text-slate-700">${s}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        `;

        const footer = `
          <div class="flex justify-end gap-3">
            <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
            <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存</button>
          </div>
        `;

        const { close, element } = openModal({ title: '編輯帳號', content, footer });

        // 角色切換連動
        element.querySelector('#edit-user-role')?.addEventListener('change', (ev) => {
          const val = ev.target.value;
          const areasWrap = element.querySelector('#edit-user-areas-wrapper');
          const salesWrap = element.querySelector('#edit-user-sales-wrapper');
          
          if (val === 'worker') {
            areasWrap.classList.remove('hidden'); areasWrap.classList.add('flex');
            salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
          } else if (val === 'sales') {
            salesWrap.classList.remove('hidden'); salesWrap.classList.add('flex');
            areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
          } else {
            areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
            salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
          }
        });

        element.querySelector('#modal-cancel-btn').addEventListener('click', close);

        element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
          const newName = element.querySelector('#edit-user-name').value.trim();
          const newPass = element.querySelector('#edit-user-pass').value.trim();
          const newRole = element.querySelector('#edit-user-role').value;

          if (!newName || !newPass) {
            showToast('帳號與密碼不能為空', 'error');
            return;
          }
          if (newName !== user.username && currentSettings.users.some(u => u.username === newName)) {
            showToast('帳號已存在', 'error');
            return;
          }

          let newAllowedAreas = [];
          let newAllowedSales = [];
          
          if (newRole === 'worker') {
            newAllowedAreas = Array.from(element.querySelectorAll('.edit-user-area-checkbox:checked')).map(cb => cb.value);
          } else if (newRole === 'sales') {
            newAllowedSales = Array.from(element.querySelectorAll('.edit-user-sales-checkbox:checked')).map(cb => cb.value);
          }

          currentSettings.users[idx] = {
            username: newName,
            password: newPass,
            role: newRole,
            allowedAreas: newAllowedAreas,
            allowedSales: newAllowedSales
          };

          await this.saveSettings();
          showToast('已更新帳號', 'success');
          close();
        });
      });
    });
  },

  renderDataManagement(container) {
    // 與原本相同
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
          點擊下方按鈕將會清空所有工單中「由 Excel 匯入」的資料。清空後，您可以重新匯入新的 Excel，系統會自動合併狀態。
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
        message: '確定要清空嗎？此操作無法復原，但您手動填寫的狀態與交期會保留。',
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
        showToast('清空失敗，請稍後再試', 'error');
      }
    });
  },

  renderImport(container) {
    // 與原本相同
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-8 text-center relative" id="drop-zone">
        <input type="file" id="excel-input" accept=".xlsx, .xls" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-brand">
          <i data-lucide="file-spreadsheet" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">點擊或拖曳 Excel 檔案至此</h3>
        <p class="text-sm text-slate-500 max-w-sm">系統將自動解析並存入資料庫。若單號已存在，將會更新 Excel 資料並保留手動狀態。</p>
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

/*
F: AI-WA-UPWO/src/pages/settings.js
V: 1792981000
W: UPGRADE-005
*/