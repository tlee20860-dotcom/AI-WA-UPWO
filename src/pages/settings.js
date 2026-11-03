import { AppState } from '../config/state.js';
import { listenDocument, getDocument, getCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { createIcons, Tag, Users, Shield, FileSpreadsheet, List, Database, LayoutDashboard, Layers, MapPin, Activity, GitBranch, Truck } from 'lucide';

// 引入拆分出去的模組
import { renderStatuses, renderRouteTemplates } from './settings-basic.js';
import { renderAreas } from './settings-area.js';
import { renderCategories } from './settings-category.js';
import { renderAreaStatuses } from './settings-area-status.js';

let unsubscribe = null;
export let currentSettings = { statuses: [], sales_mapping: [], users: [], route_templates: [], areas: [], categories: [], areaStatuses: [], suppliers: [], supplier_schema: [] };
let activeTab = 'statuses';

export default {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }

    renderPageLayout({
      title: '生產管理設定',
      subtitle: '管理工序、類別、製程路線圖與區域',
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
        currentSettings = Object.assign({}, data, {
          statuses: data.statuses || ['排產中'],
          sales_mapping: data.sales_mapping || [],
          users: data.users || [{ username: 'admin', password: '123456', role: 'admin', allowedAreas: [], allowedSales: [] }],
          route_templates: data.route_templates || this.getDefaultRouteTemplates(data.statuses || ['排產中']),
          areas: Array.isArray(data.areas) ? data.areas : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          areaStatuses: Array.isArray(data.areaStatuses) ? data.areaStatuses : ['正常', '壞機', '休息中'],
          suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
          supplier_schema: Array.isArray(data.supplier_schema) ? data.supplier_schema : []
        });

        // 遷移：areas 不存在
        if (!Array.isArray(data.areas)) needSave = true;
        
        // 遷移：areaStatuses 不存在
        if (!Array.isArray(data.areaStatuses)) needSave = true;

        // 遷移：每個使用者補 allowedAreas, allowedSales 欄位，並升級舊角色
        if (Array.isArray(currentSettings.users)) {
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
              u.role = 'viewer';
              needSave = true;
            }
          });
        }

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

        // 遷移：強制修正 uploadDate 的 Label 與屬性
        if (currentSettings.schema) {
          const uploadDateField = currentSettings.schema.find(f => f.key === 'uploadDate');
          if (uploadDateField) {
            if (uploadDateField.label !== '開單日期' || uploadDateField.isEditable !== false) {
              uploadDateField.label = '開單日期';
              uploadDateField.isEditable = false;
              needSave = true;
            }
          } else {
            currentSettings.schema.push({ key: 'uploadDate', label: '開單日期', type: 'date', isSystem: true, isEditable: false });
            needSave = true;
          }
        }

        // 資料遷移與修復：製程模板
        if (currentSettings.route_templates) {
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
        }

      } else {
        currentSettings = {
          statuses: ['排產中', '印刷', '裁切', '品檢', '出貨'],
          sales_mapping: [],
          users: [{ username: 'admin', password: '123456', role: 'admin', allowedAreas: [], allowedSales: [] }],
          route_templates: this.getDefaultRouteTemplates(),
          areas: [],
          categories: [],
          areaStatuses: ['正常', '壞機', '休息中'],
          suppliers: [],
          supplier_schema: []
        };
        needSave = true;
      }

      if (needSave) {
        // 只更新生產相關欄位，避免覆蓋其他設定（如表單、物料）
        await updateDocument('settings', 'main', {
          statuses: currentSettings.statuses,
          sales_mapping: currentSettings.sales_mapping,
          route_templates: currentSettings.route_templates,
          areas: currentSettings.areas,
          categories: currentSettings.categories,
          areaStatuses: currentSettings.areaStatuses,
          suppliers: currentSettings.suppliers,
          supplier_schema: currentSettings.supplier_schema
        });
      }

      AppState.setStatuses(currentSettings.statuses);
      this.renderTabs();
    });
  },

  getDefaultRouteTemplates(statuses = ['排產中', '印刷', '裁切', '品檢', '出貨']) {
    return [
      { name: '預設常規路線', category: '', steps: Array.from(statuses) }
    ];
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
            <i data-lucide="git-branch" class="w-4 h-4"></i> 製程路線圖
          </button>
          <button class="tab-btn ${activeTab === 'areas' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="areas">
            <i data-lucide="map-pin" class="w-4 h-4"></i> 區域管理
          </button>
          <button class="tab-btn ${activeTab === 'area_statuses' ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'} text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3" data-tab="area_statuses">
            <i data-lucide="activity" class="w-4 h-4"></i> 區域狀態
          </button>
        </div>

        <div class="flex-1 p-6 md:p-8" id="settings-content"></div>
      </div>
    `;

    createIcons({
      icons: { Tag, Users, Layers, MapPin, Activity, GitBranch },
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
    }
  },

  async saveSettings() {
    const dataToSave = {
      statuses: currentSettings.statuses,
      sales_mapping: currentSettings.sales_mapping,
      route_templates: currentSettings.route_templates,
      areas: currentSettings.areas,
      categories: currentSettings.categories,
      areaStatuses: currentSettings.areaStatuses
    };
    await updateDocument('settings', 'main', dataToSave);
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
V: 1793088000
W: UPGRADE-007
*/