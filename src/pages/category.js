import { AppState } from '../config/state.js';
import { listenCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { groupByStatus, groupByCategory } from '../domain/stats.js';
import { createIcons, Layers, Inbox, ChevronDown, User, Calendar } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let allCategories = [];
let currentCategory = null;

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '類別視圖',
      subtitle: '依發票前兩碼檢視工單狀態',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'category-container'
    });

    // 2. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.extractCategoriesAndRender();
    });
  },

  extractCategoriesAndRender() {
    const grouped = groupByCategory(currentOrders);
    allCategories = Object.keys(grouped).sort();

    // 預設選中第一個類別（若還沒選過或選中的被刪除了）
    if (allCategories.length > 0 && (!currentCategory || !allCategories.includes(currentCategory))) {
      currentCategory = allCategories[0];
    }

    this.renderLayout();
  },

  renderLayout() {
    const container = document.getElementById('category-container');
    if (!container) return;

    if (allCategories.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">目前尚無任何類別或工單</span>
        </div>
      `;
      createIcons({ icons: { Inbox }, attrs: { class: 'w-12 h-12' } });
      return;
    }

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 h-[calc(100vh-200px)]">
        
        <!-- 左側：類別清單 -->
        <div class="w-full md:w-64 flex-shrink-0 flex flex-col bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <i data-lucide="layers" class="w-5 h-5 text-brand"></i>
            <h2 class="font-bold text-slate-800">類別清單</h2>
          </div>
          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1 kanban-scroll">
            ${allCategories.map(cat => `
              <button class="cat-item text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium flex items-center justify-between ${cat === currentCategory ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-50'}" data-cat="${cat}">
                <span>${cat}</span>
                ${cat === currentCategory ? '<span class="w-1.5 h-1.5 rounded-full bg-brand"></span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 右側：該類別的工單看板 -->
        <div class="flex-1 flex flex-col min-w-0 bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 class="font-bold text-slate-800 flex items-center gap-2">
              <i data-lucide="layers" class="w-5 h-5 text-brand"></i>
              類別 ${currentCategory} 的工單
            </h2>
          </div>
          <div class="flex-1 p-4 overflow-x-auto kanban-scroll flex gap-4 bg-slate-50/30" id="cat-board">
            <!-- 由 renderCatBoard 注入 -->
          </div>
        </div>
      </div>
    `;

    createIcons({
      icons: { Layers },
      attrs: { class: 'w-5 h-5' }
    });

    this.bindEvents();
    this.renderCatBoard();
  },

  renderCatBoard() {
    const boardContainer = document.getElementById('cat-board');
    if (!boardContainer) return;

    const statuses = AppState.getStatuses() || ['排產中', '印刷', '裁切', '品檢', '出貨'];
    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';
    
    // 過濾出當前選中類別的工單
    const catOrders = currentOrders.filter(o => {
      const cat = o.data && o.data.category ? o.data.category : '其他';
      return cat === currentCategory;
    });
    
    // 依狀態分組
    const grouped = groupByStatus(catOrders, statuses);

    boardContainer.innerHTML = statuses.map(status => {
      const statusOrders = grouped[status] || [];
      
      return `
        <div class="w-[280px] flex-shrink-0 flex flex-col gap-2">
          <div class="flex items-center justify-between px-2">
            <h3 class="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${statusOrders.length > 0 ? 'bg-brand' : 'bg-slate-300'}"></span>
              ${status}
            </h3>
            <span class="text-xs font-medium bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full">${statusOrders.length}</span>
          </div>
          <div class="inset-panel p-2 flex flex-col gap-2 min-h-[150px] flex-1">
            ${statusOrders.length === 0 ? `
              <div class="flex items-center justify-center h-full text-slate-300 text-xs py-4">無</div>
            ` : statusOrders.map(order => {
              const reps = (order.salesReps || []).join(', ');
              const otherStatuses = statuses.filter(s => s !== order.status);
              return `
                <div class="glass-card p-3 rounded-xl border border-slate-100 shadow-sm text-sm relative !overflow-visible">
                  <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-slate-800">${order.id}</span>
                    ${order.dueDate ? `<span class="text-[10px] text-amber-600">交期:${order.dueDate}</span>` : ''}
                  </div>
                  <div class="text-slate-500 text-xs mb-2 flex items-center gap-1">
                    <i data-lucide="user" class="w-3 h-3"></i> ${reps}
                  </div>
                  
                  ${isAdmin ? `
                    <button class="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-brand transition-colors btn-dropdown border-t border-slate-50 pt-2 mt-1">
                      <span>流轉工序</span>
                      <i data-lucide="chevron-down" class="w-3 h-3 transition-transform"></i>
                    </button>
                    <div class="dropdown-menu hidden absolute left-0 right-0 bottom-full mb-1 bg-white border border-slate-100 shadow-xl rounded-xl p-1 z-[999]">
                      ${otherStatuses.map(s => `
                        <button class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors btn-change-status" data-id="${order.id}" data-new-status="${s}">
                          移至 ${s}
                        </button>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    createIcons({ icons: { ChevronDown, User }, attrs: { class: 'w-4 h-4' } });
    this.bindCardEvents();
  },

  bindEvents() {
    document.querySelectorAll('.cat-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newCat = e.currentTarget.dataset.cat;
        if (newCat !== currentCategory) {
          currentCategory = newCat;
          this.renderLayout();
        }
      });
    });
  },

  bindCardEvents() {
    document.querySelectorAll('#cat-board .btn-dropdown').forEach(btnDropdown => {
      const card = btnDropdown.closest('.glass-card');
      const dropdownMenu = card.querySelector('.dropdown-menu');
      
      btnDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('#cat-board .dropdown-menu').forEach(m => {
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
    });

    document.querySelectorAll('#cat-board .btn-change-status').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newStatus = btn.dataset.newStatus;
        const orderId = btn.dataset.id;
        
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

    document.addEventListener('click', () => {
      document.querySelectorAll('#cat-board .dropdown-menu').forEach(m => {
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
    allCategories = [];
    currentCategory = null;
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/category.js
V: 1792911900
W: UPGRADE-002
═══ */