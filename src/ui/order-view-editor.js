import { updateDocument } from '../db/write.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { AppState } from '../config/state.js';
import { createIcons, GripVertical, Plus, X } from 'lucide';

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

  // 3. 點擊編輯製程 ⚙️
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

    const content = `
      <div class="flex flex-col gap-4">
        <p class="text-sm text-slate-500">點擊左側加入右側，或拖曳右側調整順序。</p>
        <div class="flex flex-col md:flex-row gap-4 h-[50vh]">
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
      <div class="flex justify-end gap-3 mt-6">
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
        <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存</button>
      </div>
    `;

    const { close, element } = openModal({ title: `編輯製程路線 (${id})`, content });
    
    let currentSteps = Array.from(currentRoute);

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
          <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-grab step-item" draggable="true" data-step="${step}">
            <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300"></i>
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

      // 綁定右側拖曳
      let dragged = null;
      selectedList.querySelectorAll('.step-item').forEach(item => {
        item.addEventListener('dragstart', function() {
          dragged = this;
          setTimeout(() => this.classList.add('opacity-50'), 0);
        });
        item.addEventListener('dragend', function() {
          this.classList.remove('opacity-50');
          dragged = null;
          currentSteps = Array.from(selectedList.querySelectorAll('.step-item')).map(el => el.dataset.step);
          renderModalLists(); // 重新渲染以更新序號
        });
        item.addEventListener('dragover', function(ev) {
          ev.preventDefault();
          if (this === dragged) return;
          const rect = this.getBoundingClientRect();
          const next = (ev.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          selectedList.insertBefore(dragged, next ? this.nextSibling : this);
        });
      });
    };

    renderModalLists();

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

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/order-view-editor.js
V: 1792925100
W: UPGRADE-004
═══ */