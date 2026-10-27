import { AppState } from '../config/state.js';
import { listenCollection } from '../db/read.js';
import { renderPageLayout } from '../ui/layout.js';
import { groupByStatus, generatePivotTable } from '../domain/stats.js';
import { createIcons, Inbox, PieChart, LayoutDashboard } from 'lucide';

let unsubscribe = null;
let currentOrders = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '總狀態視圖',
      subtitle: '全廠工單狀態分佈與銷售員樞紐分析',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'overview-container'
    });

    // 2. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.renderOverview(orders);
    });
  },

  renderOverview(orders) {
    const container = document.getElementById('overview-container');
    if (!container) return;

    const statuses = AppState.getStatuses() || ['排產中', '印刷', '裁切', '品檢', '出貨'];

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">目前尚無工單資料</span>
        </div>
      `;
      createIcons({ icons: { Inbox }, attrs: { class: 'w-12 h-12' } });
      return;
    }

    // 取得所有出現過的銷售員（作為樞紐表的欄）
    const allRepsSet = new Set();
    orders.forEach(o => {
      (o.salesReps || ['未知銷售員']).forEach(r => allRepsSet.add(r));
    });
    const allReps = Array.from(allRepsSet).sort();

    // 生成樞紐表數據
    const pivotData = generatePivotTable(orders, statuses, allReps);
    const grouped = groupByStatus(orders, statuses);

    // 上半部：樞紐交叉表
    let pivotHtml = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <i data-lucide="pie-chart" class="w-5 h-5 text-brand"></i>
          <h2 class="font-bold text-slate-800">狀態 / 銷售員 樞紐分析</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr class="border-b border-slate-200/60 text-sm font-semibold text-slate-600 bg-slate-50/30">
                <th class="px-6 py-3 sticky left-0 bg-white/90 backdrop-blur z-10">工序狀態</th>
                ${allReps.map(rep => `<th class="px-4 py-3 text-center whitespace-nowrap">${rep}</th>`).join('')}
                <th class="px-6 py-3 text-center text-brand">總計</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
              ${statuses.map(status => {
                const rowData = pivotData[status] || {};
                let rowTotal = 0;
                
                const cellsHtml = allReps.map(rep => {
                  const count = rowData[rep] || 0;
                  rowTotal += count;
                  return `<td class="px-4 py-3 text-center ${count > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}">${count || '-'}</td>`;
                }).join('');

                return `
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-3 font-medium text-slate-700 sticky left-0 bg-white/90 backdrop-blur z-10">${status}</td>
                    ${cellsHtml}
                    <td class="px-6 py-3 text-center font-bold text-brand">${rowTotal}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 下半部：各狀態工單看板 (簡化版)
    let boardHtml = `
      <div class="flex items-center gap-2 mb-4">
        <i data-lucide="layout-dashboard" class="w-5 h-5 text-brand"></i>
        <h2 class="font-bold text-slate-800">各狀態工單看板</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-6">
        ${statuses.map(status => {
          const statusOrders = grouped[status] || [];
          if (statusOrders.length === 0) return ''; // 若該狀態無工單則不顯示區塊

          return `
            <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col h-[300px]">
              <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-brand"></span> ${status}
                </h3>
                <span class="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">${statusOrders.length}</span>
              </div>
              <div class="p-3 flex flex-col gap-2 flex-1 overflow-y-auto kanban-scroll inset-panel m-3">
                ${statusOrders.map(order => `
                  <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-default flex justify-between items-center">
                    <div class="flex flex-col">
                      <span class="font-bold text-slate-800 text-sm">${order.id}</span>
                      <span class="text-xs text-slate-500 mt-1">${(order.salesReps || []).join(', ')}</span>
                    </div>
                    ${order.dueDate ? `<span class="text-[10px] font-medium bg-amber-50 text-amber-600 px-2 py-1 rounded-md">${order.dueDate}</span>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = pivotHtml + boardHtml;
    createIcons({
      icons: { PieChart, LayoutDashboard },
      attrs: { class: 'w-5 h-5' }
    });
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
F: AI-WA-UPWO/src/pages/overview.js
V: 1792909600
W: UPGRADE-002
═══ */