import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { renderPageLayout } from '../ui/layout.js';
import { renderOrderView } from '../ui/order-view.js';
import { searchOrders } from '../domain/global-search.js';
import { createIcons, Search, Filter, X } from 'lucide';

let unsubscribeOrders = null;
let allOrders = [];
let currentSettings = null;
let currentSearchResults = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    try {
      currentSettings = await getDocument('settings', 'main');
    } catch (err) {
      currentSettings = {};
    }

    renderPageLayout({
      title: '全域搜尋',
      subtitle: '跨欄位、跨頁面深度搜尋工單資料',
      headerActions: '',
      stats: [],
      controls: `
        <div class="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-soft mb-6 flex flex-col gap-4">
          <!-- 搜尋列 -->
          <form id="search-form" class="flex items-center gap-2">
            <div class="relative flex-1">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <i data-lucide="search" class="w-5 h-5"></i>
              </div>
              <input type="text" id="search-keyword" class="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:border-brand transition-colors" placeholder="輸入關鍵字搜尋單號、客戶、備註、金額等...">
            </div>
            <button type="submit" class="bg-brand text-white px-6 py-3 rounded-xl font-medium hover:bg-brand-hover shadow-md shadow-brand/20 transition-all flex items-center gap-2">
              搜尋
            </button>
            <button type="button" id="btn-toggle-filter" class="bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
              <i data-lucide="filter" class="w-4 h-4"></i> 進階
            </button>
          </form>

          <!-- 進階篩選面板 (預設隱藏) -->
          <div id="advanced-filters" class="hidden grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">狀態</label>
              <select id="filter-status" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand">
                <option value="">全部狀態</option>
                ${(currentSettings.statuses || []).map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">類別</label>
              <select id="filter-category" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand">
                <option value="">全部類別</option>
                ${(currentSettings.categories || []).map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">開始日期</label>
              <input type="date" id="filter-start-date" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand">
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">結束日期</label>
              <input type="date" id="filter-end-date" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand">
            </div>
          </div>
        </div>
        
        <div id="search-results-info" class="text-sm text-slate-500 mb-2 hidden"></div>
      `,
      listContainerId: 'search-results-container'
    });

    createIcons({ icons: { Search, Filter, X }, attrs: { class: 'w-4 h-4' } });

    this.bindEvents();
    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribeOrders) unsubscribeOrders();
    unsubscribeOrders = listenCollection('work_orders', (orders) => {
      allOrders = orders.filter(o => {
        const id = String(o.id || '');
        return id && !id.includes('***') && !id.includes('訂單');
      });
      // 初始載入時不自動搜尋，除非已經有輸入條件
      this.doSearch();
    });
  },

  bindEvents() {
    const form = document.getElementById('search-form');
    const btnToggle = document.getElementById('btn-toggle-filter');
    const advancedPanel = document.getElementById('advanced-filters');

    // 切換進階面板
    btnToggle?.addEventListener('click', () => {
      advancedPanel.classList.toggle('hidden');
    });

    // 表單提交 (按下 Enter 或點擊搜尋)
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doSearch();
    });
  },

  doSearch() {
    const keyword = document.getElementById('search-keyword')?.value || '';
    const filters = {
      status: document.getElementById('filter-status')?.value || '',
      category: document.getElementById('filter-category')?.value || '',
      startDate: document.getElementById('filter-start-date')?.value || '',
      endDate: document.getElementById('filter-end-date')?.value || ''
    };

    // 若無任何條件，預設顯示最新 50 筆
    const hasCondition = keyword.trim() !== '' || Object.values(filters).some(v => v !== '');

    let results = [];
    if (hasCondition) {
      results = searchOrders(allOrders, keyword, filters);
    } else {
      results = allOrders.slice(0, 50); // 預設顯示前 50 筆
    }

    currentSearchResults = results;
    
    // 更新結果數量提示
    const infoEl = document.getElementById('search-results-info');
    if (infoEl) {
      infoEl.classList.remove('hidden');
      if (hasCondition) {
        infoEl.innerHTML = `找到 <strong class="text-brand">${results.length}</strong> 筆符合條件的資料`;
      } else {
        infoEl.innerHTML = `目前顯示最新 <strong class="text-brand">${results.length}</strong> 筆資料（輸入條件以進行搜尋）`;
      }
    }

    this.renderResults(results);
  },

  renderResults(results) {
    // 取得顯示欄位 (使用管理總表的配置，或自訂義)
    const visibleFields = (currentSettings?.view_configs?.search || currentSettings?.view_configs?.table || ['id', 'status', 'customerNameZh', 'amount']).map(key => {
      const field = (currentSettings.schema || []).find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'search-results-container',
      orders: results,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'search',
      route_templates: currentSettings.route_templates || [],
      isReadOnly: true, // 搜尋結果僅供查看，不開放行內編輯
      onAction: async (action, id) => {
        // 僅處理刪除，若有的話
        if (action === 'delete') {
          // 此處不開放刪除，保留給管理總表
        }
      }
    });
  },

  destroy() {
    if (unsubscribeOrders) {
      unsubscribeOrders();
      unsubscribeOrders = null;
    }
  }
};

/*
F: AI-WA-UPWO/src/pages/search.js
V: 1793005000
W: UPGRADE-007
*/