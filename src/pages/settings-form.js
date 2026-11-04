import { AppState } from '../config/state.js';
import { listenDocument } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { createIcons, LayoutDashboard, List, FileEdit, FunctionSquare, CheckSquare, Save, Plus, Trash2, Menu, GripVertical, Settings } from 'lucide';

// 引入拆分出去的模組
import { renderSchema, renderViewConfig } from './settings-schema.js';

let unsubscribe = null;
// 💡 修正：加入 custom_databases
export let currentSettings = { schema: [], view_configs: {}, form_layout: 'B', formulas: {}, diff_fields: ['amount'], nav_config: [], custom_databases: [] };
let activeTab = 'layout';

export default {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }

    renderPageLayout({
      title: '工單管理設定',
      subtitle: '管理系統欄位、視圖配置、表單佈局、公式與核對清單',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-form-container'
    });

    this.renderTabs();
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenDocument('settings', 'main', (data) => {
      if (data) {
        currentSettings = {
          schema: data.schema || [],
          view_configs: data.view_configs || {},
          form_layout: data.form_layout || 'B',
          formulas: data.formulas || {},
          diff_fields: Array.isArray(data.diff_fields) ? data.diff_fields : ['amount'],
          nav_config: Array.isArray(data.nav_config) ? data.nav_config : [],
          custom_databases: Array.isArray(data.custom_databases) ? data.custom_databases : [] // 💡 補上這行
        };
      }
      this.renderTabs();
    });
  },

  renderTabs() {
    const container = document.getElementById('settings-form-container');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
        
        <div class="w-full md:w-64 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 flex-shrink-0 overflow-y-auto">
          <button class="tab-btn ${activeTab === 'layout' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="layout">
            <i data-lucide="layout-dashboard" class="w-4 h-4"></i> 表單佈局
          </button>
          <button class="tab-btn ${activeTab === 'schema' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="schema">
            <i data-lucide="list" class="w-4 h-4"></i> 欄位管理
          </button>
          <button class="tab-btn ${activeTab === 'view_config' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="view_config">
            <i data-lucide="layout" class="w-4 h-4"></i> 視圖配置
          </button>
          <button class="tab-btn ${activeTab === 'nav_config' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="nav_config">
            <i data-lucide="menu" class="w-4 h-4"></i> 頁面管理
          </button>
          <button class="tab-btn ${activeTab === 'formulas' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="formulas">
            <i data-lucide="function-square" class="w-4 h-4"></i> 公式設定
          </button>
          <button class="tab-btn ${activeTab === 'diff_fields' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="diff_fields">
            <i data-lucide="check-square" class="w-4 h-4"></i> 核對清單
          </button>
        </div>

        <div class="flex-1 p-6 md:p-8" id="settings-form-content"></div>
      </div>
    `;

    createIcons({
      icons: { LayoutDashboard, List, FileEdit, FunctionSquare, CheckSquare, Save, Plus, Trash2, Menu, GripVertical, Settings },
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
    const content = document.getElementById('settings-form-content');
    if (!content) return;

    if (activeTab === 'layout') {
      this.renderFormLayout(content);
    } else if (activeTab === 'schema') {
      renderSchema(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'view_config') {
      renderViewConfig(content, currentSettings, this.saveSettings.bind(this));
    } else if (activeTab === 'nav_config') {
      this.renderNavConfig(content);
    } else if (activeTab === 'formulas') {
      this.renderFormulas(content);
    } else if (activeTab === 'diff_fields') {
      this.renderDiffFields(content);
    }
  },

  renderFormLayout(container) {
    const mode = currentSettings.form_layout || 'B';
    
    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">表單佈局</h2>
          <p class="text-sm text-slate-500 mt-1">決定「工單編輯彈窗」的排版方式。</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label class="border ${mode === 'A' ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white'} rounded-xl p-4 cursor-pointer hover:border-brand transition-colors flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input type="radio" name="form_layout" value="A" ${mode === 'A' ? 'checked' : ''} class="w-4 h-4 text-brand focus:ring-brand">
            <span class="font-bold text-slate-800">模式 A：一頁到底</span>
          </div>
          <p class="text-xs text-slate-500">所有欄位平鋪顯示，適合欄位較少的情況。</p>
        </label>

        <label class="border ${mode === 'B' ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white'} rounded-xl p-4 cursor-pointer hover:border-brand transition-colors flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input type="radio" name="form_layout" value="B" ${mode === 'B' ? 'checked' : ''} class="w-4 h-4 text-brand focus:ring-brand">
            <span class="font-bold text-slate-800">模式 B：分頁 (預設)</span>
          </div>
          <p class="text-xs text-slate-500">將欄位分類為基本、金額、狀態等分頁顯示。</p>
        </label>

        <label class="border ${mode === 'C' ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white'} rounded-xl p-4 cursor-pointer hover:border-brand transition-colors flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input type="radio" name="form_layout" value="C" ${mode === 'C' ? 'checked' : ''} class="w-4 h-4 text-brand focus:ring-brand">
            <span class="font-bold text-slate-800">模式 C：左右對照</span>
          </div>
          <p class="text-xs text-slate-500">左側顯示工單清單，右側為詳細編輯表單。</p>
        </label>
      </div>
      
      <div class="mt-8 flex justify-end">
        <button id="btn-save-layout" class="btn-primary px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> 儲存佈局設定
        </button>
      </div>
    `;

    createIcons({ icons: { Save }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-save-layout')?.addEventListener('click', async () => {
      const selected = document.querySelector('input[name="form_layout"]:checked')?.value;
      if (selected) {
        currentSettings.form_layout = selected;
        await this.saveSettings();
        showToast('佈局設定已儲存', 'success');
      }
    });
  },

  renderNavConfig(container) {
    if (!currentSettings.nav_config || currentSettings.nav_config.length === 0) {
      currentSettings.nav_config = [
        { id: 'kanban', label: '工單進度表', icon: 'layout-dashboard', showSidebar: true, showTop: true, isEnabled: true },
        { id: 'search', label: '全域搜尋', icon: 'search', showSidebar: true, showTop: false, isEnabled: true },
        { id: 'table', label: '管理總表', icon: 'table', showSidebar: true, showTop: true, isEnabled: true },
        { id: 'overview', label: '總狀態', icon: 'pie-chart', showSidebar: true, showTop: true, isEnabled: true },
        { id: 'category', label: '類別視圖', icon: 'layers', showSidebar: true, showTop: true, isEnabled: true },
        { id: 'salesperson', label: '銷售員', icon: 'users', showSidebar: true, showTop: true, isEnabled: true },
        { id: 'area', label: '生產區域', icon: 'map-pin', showSidebar: true, showTop: false, isEnabled: true },
        { id: 'settings', label: '生產管理設定', icon: 'settings', showSidebar: true, showTop: false, isEnabled: true },
        { id: 'settings-form', label: '工單管理設定', icon: 'sliders', showSidebar: true, showTop: false, isEnabled: true },
        { id: 'admin-data', label: '資料總管', icon: 'database', showSidebar: true, showTop: false, isEnabled: true }
      ];
    }

    currentSettings.nav_config.forEach(item => {
      if (item.isEnabled === undefined) item.isEnabled = true;
    });

    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">頁面管理</h2>
          <p class="text-sm text-slate-500 mt-1">可拖曳排序。勾選決定該頁面是否啟用，以及是否顯示於側欄或頂部。</p>
        </div>
      </div>

      <div class="flex flex-col gap-2" id="nav-list">
        ${currentSettings.nav_config.map((item, index) => {
          const isCore = item.id === 'table';
          return `
          <div class="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm nav-item ${!item.isEnabled ? 'opacity-60' : ''}" data-index="${index}">
            <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
            <div class="flex-1 font-bold text-slate-700">${item.label} ${isCore ? '<span class="text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded ml-2">核心</span>' : ''}</div>
            <div class="flex items-center gap-6 mr-4">
              <label class="flex items-center gap-2 cursor-pointer text-sm ${isCore ? 'text-slate-400' : 'text-slate-600'}">
                <input type="checkbox" class="nav-enabled-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" data-index="${index}" ${item.isEnabled ? 'checked' : ''} ${isCore ? 'disabled title="核心頁面不可停用"' : ''}>
                啟用
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                <input type="checkbox" class="nav-sidebar-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" data-index="${index}" ${item.showSidebar ? 'checked' : ''}>
                顯示於側欄
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                <input type="checkbox" class="nav-top-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" data-index="${index}" ${item.showTop ? 'checked' : ''}>
                顯示於頂部
              </label>
            </div>
          </div>
          `;
        }).join('')}
      </div>

      <div class="mt-8 flex justify-end">
        <button id="btn-save-nav" class="btn-primary px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> 儲存頁面管理
        </button>
      </div>
    `;

    createIcons({ icons: { Save, GripVertical }, attrs: { class: 'w-4 h-4' } });

    const navList = document.getElementById('nav-list');
    if (navList) {
      new Sortable(navList, {
        animation: 150,
        handle: '.cursor-grab',
        ghostClass: 'opacity-50',
        onEnd: () => {
          const newOrderIndexes = Array.from(navList.children).map(el => parseInt(el.dataset.index));
          const newConfig = newOrderIndexes.map(i => currentSettings.nav_config[i]);
          currentSettings.nav_config = newConfig;
          this.renderNavConfig(container);
          showToast('順序已更新，請點擊儲存', 'info');
        }
      });
    }

    container.querySelectorAll('.nav-enabled-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        currentSettings.nav_config[idx].isEnabled = e.target.checked;
      });
    });
    container.querySelectorAll('.nav-sidebar-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        currentSettings.nav_config[idx].showSidebar = e.target.checked;
      });
    });
    container.querySelectorAll('.nav-top-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        currentSettings.nav_config[idx].showTop = e.target.checked;
      });
    });

    document.getElementById('btn-save-nav')?.addEventListener('click', async () => {
      await this.saveSettings();
      window.dispatchEvent(new Event('nav-config-updated'));
      showToast('頁面管理已儲存', 'success');
    });
  },

  renderFormulas(container) {
    const editableFields = currentSettings.schema.filter(f => f.isEditable);

    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">公式設定</h2>
          <p class="text-sm text-slate-500 mt-1">設定欄位的自動計算公式。使用 {{欄位Key}} 作為變數。例如：{{quantity}} * {{price}}</p>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        ${editableFields.map(f => {
          const formula = currentSettings.formulas[f.key] || '';
          return `
            <div class="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div class="w-full md:w-1/3">
                <div class="font-bold text-slate-800">${f.label}</div>
                <div class="text-xs text-slate-400 font-mono">${f.key}</div>
              </div>
              <div class="flex-1">
                <input type="text" class="formula-input w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" 
                  data-key="${f.key}" 
                  value="${formula}" 
                  placeholder="留空表示手動輸入">
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="mt-8 flex justify-end">
        <button id="btn-save-formulas" class="btn-primary px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> 儲存公式
        </button>
      </div>
    `;

    createIcons({ icons: { Save }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-save-formulas')?.addEventListener('click', async () => {
      const newFormulas = {};
      document.querySelectorAll('.formula-input').forEach(input => {
        const key = input.dataset.key;
        const val = input.value.trim();
        if (val) newFormulas[key] = val;
      });
      currentSettings.formulas = newFormulas;
      await this.saveSettings();
      showToast('公式設定已儲存', 'success');
    });
  },

  renderDiffFields(container) {
    const allFields = currentSettings.schema;
    const diffFields = currentSettings.diff_fields || ['amount'];

    container.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800">核對清單</h2>
          <p class="text-sm text-slate-500 mt-1">勾選的欄位在 Excel 匯入時，若與手動輸入不同將標記警示（保留手動輸入值）。</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${allFields.map(f => {
          if (f.key === 'id') return '';
          const checked = diffFields.includes(f.key);
          return `
            <label class="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="diff-checkbox w-5 h-5 text-brand rounded border-slate-300 focus:ring-brand" value="${f.key}" ${checked ? 'checked' : ''}>
              <div class="flex flex-col">
                <span class="font-bold text-slate-800">${f.label}</span>
                <span class="text-xs text-slate-400 font-mono">${f.key}</span>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      <div class="mt-8 flex justify-end">
        <button id="btn-save-diff" class="btn-primary px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> 儲存核對清單
        </button>
      </div>
    `;

    createIcons({ icons: { Save }, attrs: { class: 'w-4 h-4' } });

    document.getElementById('btn-save-diff')?.addEventListener('click', async () => {
      const selected = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(cb => cb.value);
      currentSettings.diff_fields = selected;
      await this.saveSettings();
      showToast('核對清單已儲存', 'success');
    });
  },

  async saveSettings() {
    const dataToSave = {
      schema: currentSettings.schema,
      view_configs: currentSettings.view_configs,
      form_layout: currentSettings.form_layout,
      formulas: currentSettings.formulas,
      diff_fields: currentSettings.diff_fields,
      nav_config: currentSettings.nav_config
    };
    await updateDocument('settings', 'main', dataToSave);
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
};

/*
F: AI-WA-UPWO/src/pages/settings-form.js
V: 1793093000
W: UPGRADE-007
*/