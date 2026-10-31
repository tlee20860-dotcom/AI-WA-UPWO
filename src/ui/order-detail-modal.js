import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { updateDocument, setDocument } from '../db/write.js';
import { getDocument } from '../db/read.js';
import { openRouteBuilder } from './route-builder.js';
import { createIcons, ChevronLeft, ChevronRight, Settings, Plus, CheckCircle2 } from 'lucide';

/**
 * 格式化 Excel 日期
 */
function formatExcelDate(val) {
  if (!val) return "";
  if (typeof val === 'string') {
    if (val.includes('T')) return val.split('T')[0];
    if (val.includes('-') || val.includes('/')) return val.trim();
  }
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }
  return String(val).trim();
}

/**
 * 取得工單類別
 */
function getOrderCategory(order) {
  if (order.data && order.data.category) {
    return String(order.data.category).toUpperCase();
  }
  const match = String(order.id).match(/^[a-zA-Z]+/);
  return match ? match[0].toUpperCase() : '其他';
}

/**
 * 開啟工單詳細資料彈窗
 * @param {Object} options
 * @param {Object} options.order 當前工單資料
 * @param {Object} options.currentSettings 系統設定（含 statuses, route_templates）
 */
export async function openOrderDetailModal({ order, currentSettings }) {
  let allStatuses = currentSettings.statuses || [];
  let routeTemplates = currentSettings.route_templates || [];
  const orderCategory = getOrderCategory(order);
  
  // 當前工單路線
  let currentRoute = order.route && order.route.length > 0 ? [...order.route] : [...allStatuses];
  
  // 建立彈窗 UI
  const renderContent = () => {
    let idx = currentRoute.indexOf(order.status);
    if (idx === -1) idx = 0;
    const isFirst = idx <= 0;
    const isLast = idx >= currentRoute.length - 1;
    const prevStep = isFirst ? '' : currentRoute[idx - 1];
    const nextStep = isLast ? '' : currentRoute[idx + 1];

    // 過濾符合類別的模板
    const availableTemplates = routeTemplates.filter(t => {
      if (!t.categories || t.categories.length === 0) return true;
      return t.categories.includes(orderCategory);
    });

    let currentMatchName = '';
    availableTemplates.forEach(t => {
      if (JSON.stringify(t.steps) === JSON.stringify(currentRoute)) {
        currentMatchName = t.name;
      }
    });

    return `
      <div class="flex flex-col gap-6">
        <!-- 基本資訊 -->
        <div class="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div>
            <div class="text-xs text-slate-400 mb-1">工單號碼</div>
            <div class="font-bold text-lg text-slate-800">${order.id}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400 mb-1">類別</div>
            <div class="font-medium text-slate-700">${orderCategory}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400 mb-1">銷售員</div>
            <div class="font-medium text-slate-700">${(order.salesReps || []).join(', ')}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400 mb-1">上傳日期</div>
            <div class="font-medium text-slate-700">${formatExcelDate(order.uploadDate) || '-'}</div>
          </div>
        </div>

        <!-- 交貨日期 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-slate-700">交貨日期</label>
          <input type="date" id="detail-due-date" value="${formatExcelDate(order.dueDate)}" 
            class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all shadow-sm">
        </div>

        <!-- 生產流程 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-slate-700">生產流程</label>
          <div class="flex items-center gap-2">
            <select id="detail-route-select" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand shadow-sm">
              <option value="">(自訂流程)</option>
              ${availableTemplates.map(t => `<option value="${t.name}" ${t.name === currentMatchName ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
            <button id="detail-btn-new-route" class="bg-brand/10 text-brand px-4 py-2.5 rounded-xl hover:bg-brand/20 transition-colors flex items-center gap-1 font-medium text-sm">
              <i data-lucide="plus" class="w-4 h-4"></i> 新增
            </button>
          </div>
        </div>

        <!-- 當前工序 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-slate-700">當前工序</label>
          <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
            <button id="detail-prev-btn" data-route="${JSON.stringify(currentRoute).replace(/"/g, '&quot;')}" data-status="${order.status}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-100 ${isFirst ? 'opacity-30 cursor-not-allowed' : 'text-slate-700'}" ${isFirst ? 'disabled' : ''}>
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
              <span class="truncate max-w-[80px]">${prevStep}</span>
            </button>
            <div class="px-4 font-bold text-brand text-lg text-center min-w-[100px] border-x border-slate-100">
              ${order.status}
            </div>
            <button id="detail-next-btn" data-route="${JSON.stringify(currentRoute).replace(/"/g, '&quot;')}" data-status="${order.status}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-slate-100 ${isLast ? 'opacity-30 cursor-not-allowed' : 'text-slate-700'}" ${isLast ? 'disabled' : ''}>
              <span class="truncate max-w-[80px]">${nextStep}</span>
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const footer = `
    <div class="flex justify-end gap-3">
      <button id="detail-close-btn" class="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">關閉</button>
    </div>
  `;

  const { close, element } = openModal({ title: '工單詳細資料', content: renderContent(), footer, size: 'max-w-xl' });
  
  const bindEvents = () => {
    createIcons({ icons: { ChevronLeft, ChevronRight, Plus }, attrs: { class: 'w-4 h-4' } });

    // 1. 交貨日期
    element.querySelector('#detail-due-date')?.addEventListener('change', async (e) => {
      const val = e.target.value;
      await updateDocument('work_orders', order.id, { dueDate: val });
      showToast('已更新交貨日期', 'success');
      order.dueDate = val; // 本地同步
    });

    // 2. 切換流程
    element.querySelector('#detail-route-select')?.addEventListener('change', async (e) => {
      const templateName = e.target.value;
      if (!templateName) return;
      const template = routeTemplates.find(t => t.name === templateName);
      if (!template) return;

      let newStatus = order.status;
      if (!template.steps.includes(newStatus)) {
        newStatus = template.steps[0];
      }

      await updateDocument('work_orders', order.id, { route: template.steps, status: newStatus, statusUpdateDate: new Date().toISOString() });
      showToast(`已套用流程：${template.name}`, 'success');
      
      order.route = [...template.steps];
      order.status = newStatus;
      currentRoute = [...template.steps];
      
      // 重新渲染內容以更新 UI
      element.querySelector('.p-5.text-slate-600').innerHTML = renderContent();
      bindEvents();
    });

    // 3. 快速新增流程
    element.querySelector('#detail-btn-new-route')?.addEventListener('click', async () => {
      // 關閉當前視窗，打開流程建置器（為了避免視窗疊加，這裡直接呼叫，結束後再刷新）
      const settingsDoc = await getDocument('settings', 'main');
      if (!settingsDoc) return;
      
      openRouteBuilder({
        currentSettings: settingsDoc,
        availableCategories: [orderCategory], // 預設帶入該工單類別
        defaultCategory: orderCategory,
        onSave: async (newTemplate) => {
          // 儲存新模板
          const latestSettings = await getDocument('settings', 'main');
          if (!latestSettings.route_templates) latestSettings.route_templates = [];
          latestSettings.route_templates.push(newTemplate);
          await setDocument('settings', 'main', latestSettings);

          // 套用至該工單
          await updateDocument('work_orders', order.id, { route: newTemplate.steps, status: newTemplate.steps[0], statusUpdateDate: new Date().toISOString() });
          
          showToast('已新增並套用流程', 'success');
          
          // 更新本地資料
          routeTemplates = latestSettings.route_templates;
          currentRoute = [...newTemplate.steps];
          order.status = newTemplate.steps[0];
          order.route = [...newTemplate.steps];

          // 刷新彈窗內容
          element.querySelector('.p-5.text-slate-600').innerHTML = renderContent();
          bindEvents();
          
          // 觸發外部刷新
          window.dispatchEvent(new Event('settings-updated'));
        }
      });
    });

    // 4. 上一步
    element.querySelector('#detail-prev-btn')?.addEventListener('click', async (e) => {
      if (e.currentTarget.disabled) return;
      const idx = currentRoute.indexOf(order.status);
      if (idx > 0) {
        const newStatus = currentRoute[idx - 1];
        await updateDocument('work_orders', order.id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
        showToast(`已退回：${newStatus}`, 'success');
        order.status = newStatus;
        
        element.querySelector('.p-5.text-slate-600').innerHTML = renderContent();
        bindEvents();
      }
    });

    // 5. 下一步
    element.querySelector('#detail-next-btn')?.addEventListener('click', async (e) => {
      if (e.currentTarget.disabled) return;
      const idx = currentRoute.indexOf(order.status);
      if (idx !== -1 && idx < currentRoute.length - 1) {
        const newStatus = currentRoute[idx + 1];
        await updateDocument('work_orders', order.id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
        showToast(`已進入：${newStatus}`, 'success');
        order.status = newStatus;
        
        element.querySelector('.p-5.text-slate-600').innerHTML = renderContent();
        bindEvents();
      }
    });

    // 6. 關閉
    element.querySelector('#detail-close-btn')?.addEventListener('click', close);
  };

  bindEvents();
}

/*
F: AI-WA-UPWO/src/ui/order-detail-modal.js
V: 1792966000
W: UPGRADE-005
*/