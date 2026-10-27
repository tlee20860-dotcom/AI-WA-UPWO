import { AppState } from '../config/state.js';
import { listenCollection } from '../db/read.js';
import { deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { exportToExcel, exportToPDF } from '../lib/io.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { createIcons, Download, FileText, Inbox, Trash2 } from 'lucide';

let unsubscribe = null;
let currentOrders = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 渲染頁面骨架
    renderPageLayout({
      title: '管理總表',
      subtitle: '所有工單的狀態與時間追蹤列表',
      headerActions: `
        <div class="flex items-center gap-2">
          <button id="btn-export-excel" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="download" class="w-4 h-4"></i> Excel
          </button>
          <button id="btn-export-pdf" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 transition-colors active:scale-95 flex items-center gap-2 shadow-sm">
            <i data-lucide="file-text" class="w-4 h-4"></i> PDF
          </button>
        </div>
      `,
      stats: [],
      controls: '',
      listContainerId: 'table-container'
    });

    // 2. 先綁定事件（避免 createIcons 發生錯誤時中斷）
    this.bindHeaderEvents();

    // 3. 渲染圖示
    createIcons({
      icons: { Download, FileText },
      attrs: { class: 'w-4 h-4' }
    });

    // 4. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.renderTable(orders);
    });
  },

  renderTable(orders) {
    const container = document.getElementById('table-container');
    if (!container) return;

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

    // 將工單依據上傳日期或狀態排序 (這裡預設依上傳日倒序)
    const sortedOrders = [...orders].sort((a, b) => {
      const dateA = a.uploadDate || '';
      const dateB = b.uploadDate || '';
      return dateB.localeCompare(dateA);
    });

    const tableHtml = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col w-full">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr class="bg-slate-50/80 border-b border-slate-200/60 text-sm font-semibold text-slate-600">
                <th class="px-6 py-4 rounded-tl-[20px]">工單號碼</th>
                <th class="px-6 py-4">當前狀態</th>
                <th class="px-6 py-4">上傳日期</th>
                <th class="px-6 py-4">狀態更新日</th>
                <th class="px-6 py-4">交貨日期</th>
                <th class="px-6 py-4 text-center rounded-tr-[20px]">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
              ${sortedOrders.map(order => {
                const uploadDate = order.uploadDate ? order.uploadDate.split('T')[0] : '-';
                const statusUpdateDate = order.statusUpdateDate ? order.statusUpdateDate.split('T')[0] : '-';
                const dueDate = order.dueDate || '-';
                
                // 依據狀態給予不同顏色的 Badge
                let badgeClass = 'bg-slate-100 text-slate-600';
                if (order.status === '排產中') badgeClass = 'bg-amber-100 text-amber-700';
                else if (order.status === '印刷') badgeClass = 'bg-blue-100 text-blue-700';
                else if (order.status === '裁切') badgeClass = 'bg-purple-100 text-purple-700';
                else if (order.status === '品檢') badgeClass = 'bg-orange-100 text-orange-700';
                else if (order.status === '出貨') badgeClass = 'bg-emerald-100 text-emerald-700';

                return `
                  <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4 font-bold text-slate-900">${order.id}</td>
                    <td class="px-6 py-4">
                      <span class="px-2.5 py-1 rounded-md text-xs font-semibold ${badgeClass}">
                        ${order.status || '未知'}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-slate-500">${uploadDate}</td>
                    <td class="px-6 py-4 text-slate-500">${statusUpdateDate}</td>
                    <td class="px-6 py-4 font-medium ${order.dueDate ? 'text-brand' : 'text-slate-400'}">${dueDate}</td>
                    <td class="px-6 py-4 text-center">
                      <button class="btn-delete-order p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" data-id="${order.id}" title="刪除工單">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="bg-slate-50/50 px-6 py-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
          <span>共計 ${orders.length} 筆工單</span>
        </div>
      </div>
    `;

    container.innerHTML = tableHtml;
    
    // 渲染表格內的垃圾桶圖示
    createIcons({ icons: { Trash2 }, attrs: { class: 'w-4 h-4' } });

    // 綁定刪除按鈕事件
    this.bindDeleteEvents();
  },

  bindDeleteEvents() {
    document.querySelectorAll('.btn-delete-order').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.id;
        
        const confirmed = await openConfirm({
          title: '刪除工單',
          message: `確定要徹底刪除工單「${orderId}」嗎？此操作無法復原，包含手動填寫的狀態與交期都會被刪除。`,
          isDanger: true,
          confirmText: '確認刪除'
        });

        if (!confirmed) return;

        try {
          await deleteDocument('work_orders', orderId);
          showToast(`工單 ${orderId} 已刪除`, 'success');
          // 這裡不需要手動重新渲染，因為 read.js 的 listenCollection 會觸發重新渲染
        } catch (error) {
          console.error('Delete order failed:', error);
          showToast('刪除失敗，請稍後再試', 'error');
        }
      });
    });
  },

  bindHeaderEvents() {
    const statuses = AppState.getStatuses() || ['排產中', '印刷', '裁切', '品檢', '出貨'];

    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
      if (currentOrders.length === 0) {
        showToast('無資料可匯出', 'info');
        return;
      }
      try {
        exportToExcel(currentOrders, statuses, 'UPGRADE_工單總表');
        showToast('Excel 匯出成功', 'success');
      } catch (err) {
        console.error(err);
        showToast('Excel 匯出失敗', 'error');
      }
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
      if (currentOrders.length === 0) {
        showToast('無資料可匯出', 'info');
        return;
      }
      try {
        exportToPDF(currentOrders, statuses, 'UPGRADE_工單總表');
        showToast('PDF 匯出成功', 'success');
      } catch (err) {
        console.error(err);
        showToast('PDF 匯出失敗', 'error');
      }
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
F: AI-WA-UPWO/src/pages/table.js
V: 1792911400
W: UPGRADE-002
═══ */