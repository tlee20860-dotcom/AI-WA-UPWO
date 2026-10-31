import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { createIcons, Inbox, PieChart, LayoutDashboard } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let areas = [];

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        areas = settingsDoc.areas || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '總狀態視圖',
      subtitle: '全廠區域狀態分佈與銷售員樞紐分析',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'overview-container'
    });

    window.addEventListener('refresh-overview', this.updateUI.bind(this));
    window.addEventListener('settings-updated', this.updateUI.bind(this));

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateUI();
    });
  },

  updateUI() {
    const container = document.getElementById('overview-container');
    if (!container) return;

    // 過濾垃圾資料
    const cleanOrders = currentOrders.filter(o => {
      const id = String(o.id || '');
      return id && !id.includes('***') && !id.includes('訂單');
    });

    if (cleanOrders.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">目前尚無工單資料</span>
        </div>
      `;
      createIcons({ icons: { Inbox }, attrs: { class: 'w-12 h-12' } });
      return;
    }

    // 1. 建立「工序 -> 區域名稱」映射
    const statusToAreaName = {};
    areas.forEach(area => {
      (area.statuses || []).forEach(s => {
        statusToAreaName[s] = area.name;
      });
    });

    // 2. 取得所有要顯示的列（區域名稱）
    let areaNames = areas.map(a => a.name);
    // 若有不屬於任何區域的工序，加上「未分配區域」一列
    const hasUnassigned = cleanOrders.some(o => !statusToAreaName[o.status]);
    if (hasUnassigned) {
      areaNames.push('未分配區域');
    }

    // 3. 取得所有銷售員作為欄
    const allRepsSet = new Set();
    cleanOrders.forEach(o => {
      (o.salesReps || ['未填寫']).forEach(r => allRepsSet.add(r));
    });
    const allReps = Array.from(allRepsSet).sort();

    // 4. 生成樞紐分析資料 (區域 vs 銷售員)
    const pivotData = {};
    areaNames.forEach(areaName => {
      pivotData[areaName] = {};
      allReps.forEach(rep => { pivotData[areaName][rep] = 0; });
    });

    cleanOrders.forEach(order => {
      const reps = order.salesReps || ['未填寫'];
      const areaName = statusToAreaName[order.status] || '未分配區域';
      
      reps.forEach(rep => {
        if (!pivotData[areaName]) pivotData[areaName] = {};
        if (pivotData[areaName][rep] === undefined) pivotData[areaName][rep] = 0;
        pivotData[areaName][rep]++;
      });
    });

    let pivotHtml = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <i data-lucide="pie-chart" class="w-5 h-5 text-brand"></i>
          <h2 class="font-bold text-slate-800">區域 / 銷售員 樞紐分析</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr class="border-b border-slate-200/60 text-sm font-semibold text-slate-600 bg-slate-50/30">
                <th class="px-6 py-3 sticky left-0 bg-white/90 backdrop-blur z-10">生產區域</th>
                ${allReps.map(rep => `<th class="px-4 py-3 text-center whitespace-nowrap">${rep}</th>`).join('')}
                <th class="px-6 py-3 text-center text-brand">總計</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
              ${areaNames.map(areaName => {
                const rowData = pivotData[areaName] || {};
                let rowTotal = 0;
                
                const cellsHtml = allReps.map(rep => {
                  const count = rowData[rep] || 0;
                  rowTotal += count;
                  return `<td class="px-4 py-3 text-center ${count > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}">${count || '-'}</td>`;
                }).join('');

                return `
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-3 font-medium text-slate-700 sticky left-0 bg-white/90 backdrop-blur z-10">${areaName}</td>
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

    // 下半部：工單動態列表 (使用 order-view)
    let listHtml = `
      <div class="flex items-center gap-2 mb-4 mt-8">
        <i data-lucide="layout-dashboard" class="w-5 h-5 text-brand"></i>
        <h2 class="font-bold text-slate-800">工單狀態列表</h2>
      </div>
      <div id="overview-list-container"></div>
    `;

    container.innerHTML = pivotHtml + listHtml;

    createIcons({ icons: { PieChart, LayoutDashboard }, attrs: { class: 'w-5 h-5' } });

    // 依使用者設定的順序對齊欄位
    const visibleFields = (viewConfig['overview'] || ['id', 'status', 'salesReps', 'dueDate']).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    // 渲染下半部的工單列表
    renderOrderView({
      containerId: 'overview-list-container',
      orders: cleanOrders,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'overview',
      isReadOnly: true, // 設定為唯讀
      onAction: async (action, id, newStatus) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'status_change') {
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-overview', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/overview.js
V: 1792964000
W: UPGRADE-005
*/