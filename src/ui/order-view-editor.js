import { updateDocument, setDocument } from '../db/write.js';
import { getDocument, getCollection } from '../db/read.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { openRouteBuilder } from './route-builder.js';
import { AppState } from '../config/state.js';
import { createIcons, GripVertical, Plus, X } from 'lucide';

/**
 * 取得工單類別 (優先從 data.category，其次從工單號前兩碼)
 */
function getOrderCategory(order) {
  if (order.data && order.data.category) {
    return String(order.data.category).toUpperCase();
  }
  const match = String(order.id).match(/^[a-zA-Z]+/);
  return match ? match[0].toUpperCase() : '其他';
}

/**
 * 處理行內編輯事件
 */
window.addEventListener('inline-edit', async (e) => {
  const { id, key, value } = e.detail;
  if (!id || !key) return;

  try {
    const updateData = {};
    
    // 系統核心欄位清單（直接更新根節點）
    const coreFields = ['id', 'status', 'salesReps', 'uploadDate', 'dueDate', 'statusUpdateDate', 'route'];
    
    if (coreFields.includes(key)) {
      updateData[key] = value;
    } else {
      // 動態欄位必須使用點記法 (dot notation) 更新 data 物件內的屬性
      updateData[`data.${key}`] = value;
    }

    await updateDocument('work_orders', id, updateData);
    showToast(`已更新資料`, 'success');
    
  } catch (error) {
    console.error('[Inline Edit Error]', error);
    showToast('更新失敗，請檢查網路或稍後再試', 'error');
  }
});

/**
 * 處理下拉選單切換生產流程事件
 */
window.addEventListener('change-route', async (e) => {
  const { id, templateName } = e.detail;
  if (!id || !templateName) return;

  try {
    const settings = await getDocument('settings', 'main');
    const templates = settings.route_templates || [];
    const template = templates.find(t => t.name === templateName);

    if (!template) {
      showToast('找不到該流程模板', 'error');
      return;
    }

    const orderDoc = await getDocument('work_orders', id);
    if (!orderDoc) return;

    let newStatus = orderDoc.status;
    // 如果新流程不包含當前狀態，則退回第一步
    if (!template.steps.includes(newStatus)) {
      newStatus = template.steps[0];
    }

    await updateDocument('work_orders', id, {
      route: template.steps,
      status: newStatus,
      statusUpdateDate: new Date().toISOString()
    });
    
    showToast(`已套用流程：${template.name}`, 'success');
  } catch (err) {
    console.error('[Change Route Error]', err);
    showToast('套用失敗', 'error');
  }
});

/**
 * 處理開啟快速新增流程彈窗事件
 */
window.addEventListener('open-route-builder', async (e) => {
  const { orderId, defaultCategory } = e.detail;
  
  try {
    const settings = await getDocument('settings', 'main');
    if (!settings) return;

    // 獲取現有的所有類別 (掃描所有工單)
    const allOrders = await getCollection('work_orders');
    const categories = new Set();
    allOrders.forEach(o => {
      const cat = getOrderCategory(o);
      if (cat !== '其他') categories.add(cat);
    });

    openRouteBuilder({
      currentSettings: settings,
      availableCategories: Array.from(categories),
      defaultCategory: defaultCategory,
      onSave: async (newTemplate) => {
        // 1. 儲存新模板到 settings
        const latestSettings = await getDocument('settings', 'main');
        if (!latestSettings.route_templates) latestSettings.route_templates = [];
        latestSettings.route_templates.push(newTemplate);
        await setDocument('settings', 'main', latestSettings);

        // 2. 套用到當前工單
        if (orderId) {
          await updateDocument('work_orders', orderId, {
            route: newTemplate.steps,
            status: newTemplate.steps[0],
            statusUpdateDate: new Date().toISOString()
          });
          showToast('已新增並套用流程', 'success');
        } else {
          showToast('已新增流程', 'success');
        }
        
        // 觸發刷新
        window.dispatchEvent(new Event('settings-updated'));
        const pageKey = window.location.hash.replace('#', '') || 'table';
        window.dispatchEvent(new Event(`refresh-${pageKey}`));
      }
    });
  } catch (err) {
    console.error(err);
    showToast('讀取資料失敗', 'error');
  }
});

/**
 * 處理全域點擊事件（上/下工序與編輯製程）
 */
document.addEventListener('click', async (e) => {
  // 1. 點擊上一個工序
  const prevBtn = e.target.closest('button[data-action="prev-step"]');
  if (prevBtn) {
    const id = prevBtn.dataset.id;
    const routeStr = prevBtn.dataset.route;
    const currentStatus = prevBtn.dataset.status;
    
    try {
      const route = JSON.parse(routeStr);
      const idx = route.indexOf(currentStatus);
      if (idx > 0) {
        const newStatus = route[idx - 1];
        await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
        showToast(`已退回：${newStatus}`, 'success');
      }
    } catch (err) {
      console.error('[Prev Step Error]', err);
    }
    return;
  }

  // 2. 點擊下一個工序
  const nextBtn = e.target.closest('button[data-action="next-step"]');
  if (nextBtn) {
    const id = nextBtn.dataset.id;
    const routeStr = nextBtn.dataset.route;
    const currentStatus = nextBtn.dataset.status;
    
    try {
      const route = JSON.parse(routeStr);
      const idx = route.indexOf(currentStatus);
      if (idx !== -1 && idx < route.length - 1) {
        const newStatus = route[idx + 1];
        await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
        showToast(`已進入：${newStatus}`, 'success');
      }
    } catch (err) {
      console.error('[Next Step Error]', err);
    }
    return;
  }

  // 3. 點擊編輯製程 ⚙️ (保留給管理總表或特定頁面使用)
  const editRouteBtn = e.target.closest('button[data-action="edit-route"]');
  if (editRouteBtn) {
    const id = editRouteBtn.dataset.id;
    const routeStr = editRouteBtn.dataset.route;
    const currentStatus = editRouteBtn.dataset.status;
    
    let currentRoute = [];
    try {
      currentRoute = JSON.parse(routeStr);
    } catch (e) {
      currentRoute = [];
    }

    const allStatuses = AppState.getStatuses() || [];

    // 獲取最新的設定與模板
    let routeTemplates = [];
    try {
      const settings = await getDocument('settings', 'main');
      if (settings && settings.route_templates) {
        routeTemplates = settings.route_templates;
      }
    } catch (err) {
      console.warn('無法讀取模板設定', err);
    }

    const templateOptions = routeTemplates.map((t, i) => {
      const label = t.categories && t.categories.length > 0 ? `[${t.categories.join(',')}] ${t.name}` : `[通用] ${t.name}`;
      return `<option value="${i}">${label}</option>`;
    }).join('');

    const content = `
      <div class="flex flex-col gap-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
          <p class="text-sm text-slate-500">點擊左側加入右側，或拖曳右側調整順序。</p>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <select id="modal-template-select" class="flex-1 sm:w-48 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand shadow-sm">
              <option value="">-- 快速套用模板 --</option>
              ${templateOptions}
            </select>
          </div>
        </div>
        
        <div class="flex flex-col md:flex-row gap-4 h-[40vh]">
          <!-- 左側：可選工序 -->
          <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
            <h4 class="font-bold text-sm text-slate-700 mb-2">可選工序</h4>
            <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="modal-available-list"></div>
          </div>
          <!-- 右側：預計工序順序 -->
          <div class="flex-1 bg-white border border-slate-200 rounded-xl p-3 flex flex-col shadow-sm">
            <h4 class="font-bold text-sm text-slate-700 mb-2">預計工序順序</h4>
            <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="modal-selected-list"></div>
          </div>
        </div>
      </div>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
        <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存</button>
      </div>
    `;

    const { close, element } = openModal({ title: `編輯製程路線 (${id})`, content, footer });
    
    let currentSteps = Array.from(currentRoute);
    let sortableInstance = null;

    const renderModalLists = () => {
      const availableList = element.querySelector('#modal-available-list');
      const selectedList = element.querySelector('#modal-selected-list');
      
      const availableStatuses = allStatuses.filter(s => !currentSteps.includes(s));

      // 渲染左側
      if (availableStatuses.length === 0) {
        availableList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">所有工序已加入</div>';
      } else {
        availableList.innerHTML = availableStatuses.map(status => `
          <div class="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-brand transition-colors available-item" data-step="${status}">
            <span class="flex-1 font-medium text-slate-700">${status}</span>
            <i data-lucide="plus" class="w-4 h-4 text-slate-400"></i>
          </div>
        `).join('');
      }

      // 渲染右側
      if (currentSteps.length === 0) {
        selectedList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">請從左側加入工序</div>';
      } else {
        selectedList.innerHTML = currentSteps.map((step, idx) => `
          <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 step-item" data-step="${step}">
            <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 cursor-grab"></i>
            <span class="flex-1 font-medium text-slate-700"><span class="text-slate-400 mr-1">${idx + 1}.</span>${step}</span>
            <button class="text-slate-400 hover:text-rose-500 btn-remove-step" data-step="${step}">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        `).join('');
      }

      createIcons({ icons: { Plus, GripVertical, X }, attrs: { class: 'w-4 h-4' } });
      
      // 綁定左側點擊加入
      availableList.querySelectorAll('.available-item').forEach(item => {
        item.addEventListener('click', () => {
          const step = item.dataset.step;
          if (!currentSteps.includes(step)) {
            currentSteps.push(step);
            renderModalLists();
          }
        });
      });

      // 綁定右側移除
      selectedList.querySelectorAll('.btn-remove-step').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          const step = ev.currentTarget.dataset.step;
          currentSteps = currentSteps.filter(s => s !== step);
          renderModalLists();
        });
      });

      // SortableJS 拖曳
      if (sortableInstance) sortableInstance.destroy();
      if (currentSteps.length > 0) {
        sortableInstance = new Sortable(selectedList, {
          animation: 150,
          handle: '.cursor-grab',
          ghostClass: 'opacity-50',
          forceFallback: true,
          fallbackTolerance: 3,
          onEnd: () => {
            currentSteps = Array.from(selectedList.children).map(el => el.dataset.step);
            renderModalLists();
          }
        });
      }
    };

    renderModalLists();

    // 快速套用模板變更事件
    element.querySelector('#modal-template-select').addEventListener('change', (ev) => {
      const idx = parseInt(ev.target.value);
      if (!isNaN(idx) && routeTemplates[idx]) {
        currentSteps = [...routeTemplates[idx].steps];
        renderModalLists();
        showToast(`已套用模板：${routeTemplates[idx].name}`, 'info');
        ev.target.value = ''; // 重設下拉選單
      }
    });

    element.querySelector('#modal-cancel-btn').addEventListener('click', close);

    element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
      if (currentSteps.length === 0) {
        showToast('製程路線不能為空', 'error');
        return;
      }

      let newStatus = currentStatus;
      
      // 若原本的狀態不在新路線中，依規則退回上一個工序
      if (!currentSteps.includes(currentStatus)) {
        let fallbackStatus = currentSteps[0]; // 預設退回第一個
        
        // 尋找原本路線中當前狀態的上一個工序
        const oldIdx = currentRoute.indexOf(currentStatus);
        if (oldIdx > 0) {
          const prevStatus = currentRoute[oldIdx - 1];
          // 如果上一個工序存在於新路線中，就退回它
          if (currentSteps.includes(prevStatus)) {
            fallbackStatus = prevStatus;
          }
        }
        newStatus = fallbackStatus;
      }

      const confirmBtn = element.querySelector('#modal-confirm-btn');
      confirmBtn.disabled = true;
      confirmBtn.textContent = '儲存中...';

      try {
        await updateDocument('work_orders', id, { 
          route: currentSteps,
          status: newStatus,
          statusUpdateDate: new Date().toISOString()
        });
        showToast(`製程已更新${newStatus !== currentStatus ? `，狀態退回至：${newStatus}` : ''}`, 'success');
        close();
      } catch (err) {
        console.error(err);
        showToast('更新失敗，請稍後再試', 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '儲存';
      }
    });
    return;
  }
});

/*
F: AI-WA-UPWO/src/ui/order-view-editor.js
V: 1792954000
W: UPGRADE-005
*/