import { AppState } from '../config/state.js';
import { listenCollection } from '../db/read.js';
import { renderPageLayout } from '../ui/layout.js';
import { groupByStatus } from '../domain/stats.js';
import { createIcons, Inbox, Users, UserCircle } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let allReps = [];
let currentRep = null;

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '銷售員視圖',
      subtitle: '依銷售員檢視名下工單與狀態分佈',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'salesperson-container'
    });

    // 2. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.extractRepsAndRender();
    });
  },

  extractRepsAndRender() {
    // 提取所有不重複的銷售員
    const repsSet = new Set();
    currentOrders.forEach(o => {
      (o.salesReps || ['未知銷售員']).forEach(r => repsSet.add(r));
    });
    allReps = Array.from(repsSet).sort();

    // 預設選中第一個銷售員（若還沒選過或選中的被刪除了）
    if (allReps.length > 0 && (!currentRep || !allReps.includes(currentRep))) {
      currentRep = allReps[0];
    }

    this.renderLayout();
  },

  renderLayout() {
    const container = document.getElementById('salesperson-container');
    if (!container) return;

    if (allReps.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">目前尚無銷售員資料或工單</span>
        </div>
      `;
      createIcons({ icons: { Inbox }, attrs: { class: 'w-12 h-12' } });
      return;
    }

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 h-[calc(100vh-200px)]">
        
        <!-- 左側：銷售員清單 -->
        <div class="w-full md:w-64 flex-shrink-0 flex flex-col bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <i data-lucide="users" class="w-5 h-5 text-brand"></i>
            <h2 class="font-bold text-slate-800">銷售員清單</h2>
          </div>
          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-1 kanban-scroll">
            ${allReps.map(rep => `
              <button class="rep-item text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium flex items-center justify-between ${rep === currentRep ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-50'}" data-rep="${rep}">
                <span>${rep}</span>
                ${rep === currentRep ? '<span class="w-1.5 h-1.5 rounded-full bg-brand"></span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 右側：該銷售員的工單狀態看板 -->
        <div class="flex-1 flex flex-col min-w-0 bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 class="font-bold text-slate-800 flex items-center gap-2">
              <i data-lucide="user-circle" class="w-5 h-5 text-brand"></i>
              ${currentRep} 的工單
            </h2>
          </div>
          <div class="flex-1 p-4 overflow-x-auto kanban-scroll flex gap-4 bg-slate-50/30" id="rep-board">
            <!-- 由 renderRepBoard 注入 -->
          </div>
        </div>
      </div>
    `;

    createIcons({
      icons: { Users, UserCircle },
      attrs: { class: 'w-5 h-5' }
    });

    this.bindEvents();
    this.renderRepBoard();
  },

  renderRepBoard() {
    const boardContainer = document.getElementById('rep-board');
    if (!boardContainer) return;

    const statuses = AppState.getStatuses() || ['排產中', '印刷', '裁切', '品檢', '出貨'];
    
    // 過濾出當前選中銷售員的工單
    const repOrders = currentOrders.filter(o => (o.salesReps || []).includes(currentRep));
    
    // 依狀態分組
    const grouped = groupByStatus(repOrders, statuses);

    // 僅顯示有工單的狀態，或者全部顯示（這裡選擇全部顯示，方便看出進度）
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
            ` : statusOrders.map(order => `
              <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm">
                <div class="font-bold text-slate-800 mb-1">${order.id}</div>
                ${order.details && order.details['客戶'] ? `<div class="text-slate-500 text-xs mb-2">${order.details['客戶']}</div>` : ''}
                <div class="text-[10px] text-slate-400 flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                  <span>交期：${order.dueDate || '-'}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  bindEvents() {
    // 點擊左側銷售員切換
    document.querySelectorAll('.rep-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newRep = e.currentTarget.dataset.rep;
        if (newRep !== currentRep) {
          currentRep = newRep;
          // 重新渲染左側選中狀態與右側看板
          this.renderLayout();
        }
      });
    });
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    currentOrders = [];
    allReps = [];
    currentRep = null;
  }
};

/* ═══ EOF ═══
F: src/pages/salesperson.js
V: 1792903515
W: webapp-20261026-001#27
═══ */