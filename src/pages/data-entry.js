import { AppState } from '../config/state.js';
import { getDocument, getCollection, listenCollection } from '../db/read.js';
import { setDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { renderOrderEditor } from '../ui/order-editor.js';
import { createIcons, Search, Plus, FileText, ArrowLeft, Layers } from 'lucide';

let currentSettings = null;
let isViewMode = false;
let currentOrder = null;
let sidebarOrders = [];
let unsubscribeOrders = null;

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 載入系統設定
    try {
      currentSettings = await getDocument('settings', 'main');
    } catch (err) {
      showToast('無法載入系統設定', 'error');
      return;
    }

    if (!currentSettings) {
      showToast('系統設定為空，請先初始化', 'error');
      return;
    }

    // 2. 初始化頁面佈局
    renderPageLayout({
      title: '資料錄入',
      subtitle: '手動建立新工單或載入現有工單進行編輯',
      headerActions: `
        <div class="flex items-center gap-3">
          <button id="btn-new-order" class="bg-brand text-white border border-brand px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-brand-hover flex items-center gap-2 shadow-sm transition-colors">
            <i data-lucide="plus" class="w-4 h-4"></i> 新增工單
          </button>
        </div>
      `,
      controls: '',
      listContainerId: 'data-entry-container'
    });

    createIcons({ icons: { Plus, Search, FileText, ArrowLeft, Layers }, attrs: { class: 'w-4 h-4' } });

    // 3. 繪製佈局容器
    const container = document.getElementById('data-entry-container');
    const layoutMode = currentSettings.form_layout || 'B'; // 預設為 B (分頁)

    if (layoutMode === 'C') {
      // 模式 C：左右對照
      container.innerHTML = `
        <div class="flex flex-col md:flex-row gap-4 h-[calc(100vh-200px)]">
          <!-- 左側：工單清單 -->
          <div class="w-full md:w-1/3 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div class="p-3 border-b border-slate-100 bg-slate-50">
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <i data-lucide="search" class="w-4 h-4"></i>
                </div>
                <input type="text" id="sidebar-search" class="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="搜尋單號...">
              </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1" id="sidebar-list">
              <div class="text-center text-slate-400 text-sm py-4">載入中...</div>
            </div>
          </div>
          <!-- 右側：表單區 -->
          <div class="w-full md:w-2/3 h-full" id="editor-container"></div>
        </div>
      `;
      
      // 啟動左側清單監聽
      this.initSidebarList();
      document.getElementById('sidebar-search')?.addEventListener('input', (e) => {
        this.filterSidebar(e.target.value);
      });

    } else {
      // 模式 A 或 B：單一表單區
      container.innerHTML = `
        <div class="max-w-5xl mx-auto h-[calc(100vh-200px)]">
          <div id="editor-container" class="h-full"></div>
        </div>
      `;
    }

    // 4. 綁定新增按鈕
    document.getElementById('btn-new-order')?.addEventListener('click', () => {
      this.loadNewOrder();
    });

    // 5. 初始載入表單 (預設為新增)
    this.loadNewOrder();
  },

  /**
   * 初始化左側清單 (模式 C 專用)
   */
  initSidebarList() {
    if (unsubscribeOrders) unsubscribeOrders();
    unsubscribeOrders = listenCollection('work_orders', (orders) => {
      // 過濾垃圾資料
      sidebarOrders = orders.filter(o => o.id && !String(o.id).includes('***'));
      // 由新到舊排序
      sidebarOrders.sort((a, b) => new Date(b.uploadDate || 0) - new Date(a.uploadDate || 0));
      this.renderSidebarList(sidebarOrders);
    });
  },

  renderSidebarList(orders) {
    const listEl = document.getElementById('sidebar-list');
    if (!listEl) return;

    if (orders.length === 0) {
      listEl.innerHTML = '<div class="text-center text-slate-400 text-sm py-4">無資料</div>';
      return;
    }

    listEl.innerHTML = orders.map(o => `
      <button class="w-full text-left p-3 rounded-lg border ${currentOrder?.id === o.id ? 'bg-brand/5 border-brand/30' : 'bg-white border-transparent hover:bg-slate-50'} transition-colors flex flex-col gap-1" data-id="${o.id}">
        <div class="flex justify-between items-center">
          <span class="font-bold text-slate-800 text-sm">${o.id}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${o.source === 'manual' ? '手動' : 'Excel'}</span>
        </div>
        <div class="flex justify-between items-center text-xs text-slate-500">
          <span>${o.data?.customerNameZh || o.data?.customCategory || '無客戶名'}</span>
          <span>${o.status || '無狀態'}</span>
        </div>
      </button>
    `).join('');

    listEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this.loadOrder(id);
      });
    });
  },

  filterSidebar(keyword) {
    const kw = String(keyword).toLowerCase().trim();
    if (!kw) {
      this.renderSidebarList(sidebarOrders);
      return;
    }
    const filtered = sidebarOrders.filter(o => String(o.id).toLowerCase().includes(kw));
    this.renderSidebarList(filtered);
  },

  /**
   * 載入新工單表單 (清空)
   */
  loadNewOrder() {
    currentOrder = null;
    isViewMode = false;
    
    // 高亮左側清單 (若有)
    if (currentSettings.form_layout === 'C') {
      this.renderSidebarList(sidebarOrders); 
    }

    const container = document.getElementById('editor-container');
    if (!container) return;

    renderOrderEditor({
      container: container,
      schema: currentSettings.schema || [],
      formulas: currentSettings.formulas || {},
      viewConfig: currentSettings.view_configs?.['data-entry'] || [],
      routeTemplates: currentSettings.route_templates || [], // 💡 傳入製程模板
      layoutMode: currentSettings.form_layout || 'B',
      initialData: null,
      isViewMode: false,
      onSave: this.handleSave.bind(this),
      onCancel: () => {
        if (currentSettings.form_layout === 'C') {
          // 若在 C 模式，取消就清空右側
          this.loadNewOrder();
        } else {
          // 若在其他模式，取消就跳轉回總表或回首頁
          window.location.hash = '#kanban';
        }
      }
    });
  },

  /**
   * 載入指定工單
   */
  async loadOrder(id) {
    try {
      const orderDoc = await getDocument('work_orders', id);
      if (!orderDoc) {
        showToast('找不到該工單', 'error');
        return;
      }

      currentOrder = orderDoc;
      isViewMode = true;

      if (currentSettings.form_layout === 'C') {
        this.renderSidebarList(sidebarOrders);
      }

      this.renderEditor();
      showToast('已載入工單資料', 'success');
    } catch (err) {
      console.error(err);
      showToast('載入失敗', 'error');
    }
  },

  /**
   * 渲染表單 (依據當前 currentOrder 與 isViewMode)
   */
  renderEditor() {
    const container = document.getElementById('editor-container');
    if (!container) return;

    renderOrderEditor({
      container: container,
      schema: currentSettings.schema || [],
      formulas: currentSettings.formulas || {},
      viewConfig: currentSettings.view_configs?.['data-entry'] || [],
      routeTemplates: currentSettings.route_templates || [], // 💡 傳入製程模板
      layoutMode: currentSettings.form_layout || 'B',
      initialData: currentOrder,
      isViewMode: isViewMode,
      onSave: this.handleSave.bind(this),
      onCancel: () => {
        if (isViewMode) {
          // 若在檢視模式下取消，就清空表單
          this.loadNewOrder();
        } else {
          // 若在編輯模式下取消，就恢復為檢視模式
          isViewMode = true;
          this.renderEditor();
        }
      }
    });
  },

  /**
   * 處理儲存邏輯
   */
  async handleSave(formData) {
    // 1. 基本驗證
    if (!formData.id || String(formData.id).trim() === '') {
      showToast('工單號碼為必填欄位', 'error');
      return;
    }
    
    const orderId = String(formData.id).trim();
    formData.id = orderId; // 確保乾淨

    try {
      // 2. 檢查是否為新增 (若 currentOrder 為 null 或 id 不同)
      if (!currentOrder || currentOrder.id !== orderId) {
        // 進一步檢查資料庫是否已存在該 ID (防重複)
        const existing = await getDocument('work_orders', orderId);
        if (existing) {
          showToast(`工單 ${orderId} 已存在，已切換為編輯模式`, 'info');
          // 載入該工單資料，並切換為編輯模式
          currentOrder = existing;
          isViewMode = false;
          this.renderEditor();
          return;
        }

        // 確認為全新工單
        formData.source = 'manual';
        
        // 💡 若未設定路線與狀態，則給予預設值
        if (!formData.route || formData.route.length === 0) {
          formData.route = currentSettings.statuses ? [...currentSettings.statuses] : [];
          formData.status = currentSettings.statuses?.[0] || '排產中';
        }
        
        formData.uploadDate = formData.uploadDate || new Date().toISOString().split('T')[0];
        formData.statusUpdateDate = formData.uploadDate;

        await setDocument('work_orders', orderId, formData);
        showToast('工單新增成功', 'success');
      } else {
        // 3. 更新現有工單
        // 為了避免覆蓋非顯示欄位，這裡直接使用 formData (它包含了所有初始值與表單修改值)
        await updateDocument('work_orders', orderId, formData);
        showToast('工單更新成功', 'success');
      }

      // 4. 儲存後行為
      // 重新拉取最新資料以確保同步
      currentOrder = await getDocument('work_orders', orderId);
      isViewMode = true; // 切換為檢視模式
      
      if (currentSettings.form_layout === 'C') {
        // 更新左側清單的高亮
        this.renderSidebarList(sidebarOrders);
      }
      
      this.renderEditor();

    } catch (err) {
      console.error('[Save Error]', err);
      showToast('儲存失敗，請查看 Console', 'error');
    }
  },

  destroy() {
    if (unsubscribeOrders) {
      unsubscribeOrders();
      unsubscribeOrders = null;
    }
  }
};

/*
F: AI-WA-UPWO/src/pages/data-entry.js
V: 1793026000
W: UPGRADE-007
*/