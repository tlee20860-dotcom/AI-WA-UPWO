import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { createIcons, Plus, GripVertical, Trash2, Edit2 } from 'lucide';

/**
 * 渲染「區域狀態」管理頁籤
 * @param {HTMLElement} container 目標容器
 * @param {Object} currentSettings settings/main 的內容
 * @param {Function} saveSettings 儲存回呼（async）
 */
export function renderAreaStatuses(container, currentSettings, saveSettings) {
  // 若無資料，初始化預設值
  if (!currentSettings.areaStatuses) {
    currentSettings.areaStatuses = ['正常', '壞機', '休息中'];
  }
  
  const statuses = currentSettings.areaStatuses;

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">區域狀態管理</h2>
        <p class="text-sm text-slate-500 mt-1">可拖曳排序。這些狀態將提供給「生產區域」切換使用（例如：正常、壞機）。</p>
      </div>
    </div>

    <div class="flex gap-2 mb-6">
      <input type="text" id="new-area-status-input" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="輸入新狀態名稱 (例如：維修中)">
      <button id="btn-add-area-status" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="inset-panel p-4 flex flex-col gap-2" id="area-status-list">
      ${statuses.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無狀態，請先新增</div>' : ''}
      ${statuses.map((status, index) => `
        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm area-status-item" data-index="${index}">
          <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
          <span class="flex-1 font-medium text-slate-700 area-status-name">${status}</span>
          <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-area-status" data-status="${status}">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-area-status" data-status="${status}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, GripVertical, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  // 初始化拖曳排序
  const statusList = document.getElementById('area-status-list');
  if (statusList && statuses.length > 1) {
    new Sortable(statusList, {
      animation: 150,
      handle: '.cursor-grab',
      ghostClass: 'opacity-50',
      forceFallback: true,
      fallbackTolerance: 3,
      onEnd: async () => {
        const newOrder = Array.from(statusList.children).map(el => el.querySelector('.area-status-name').textContent);
        currentSettings.areaStatuses = newOrder;
        await saveSettings();
        showToast('狀態排序已更新', 'success');
      }
    });
  }

  // 新增狀態
  document.getElementById('btn-add-area-status')?.addEventListener('click', async () => {
    const input = document.getElementById('new-area-status-input');
    const val = input.value.trim();
    if (!val) return;
    if (currentSettings.areaStatuses.includes(val)) {
      showToast('狀態已存在', 'error');
      return;
    }
    currentSettings.areaStatuses.push(val);
    await saveSettings();
    showToast('新增成功', 'success');
  });

  // 修改狀態
  document.querySelectorAll('.btn-edit-area-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const oldStatus = e.currentTarget.dataset.status;
      const newStatus = window.prompt(`修改狀態名稱（原為「${oldStatus}」）：`, oldStatus);
      if (!newStatus || newStatus.trim() === "" || newStatus === oldStatus) return;
      const trimmedNewStatus = newStatus.trim();

      if (currentSettings.areaStatuses.includes(trimmedNewStatus)) {
        showToast('該狀態名稱已存在', 'error');
        return;
      }

      const idx = currentSettings.areaStatuses.indexOf(oldStatus);
      if (idx !== -1) {
        currentSettings.areaStatuses[idx] = trimmedNewStatus;
        
        // 同步更新現有區域的 currentStatus (如果剛好正在使用該狀態)
        if (currentSettings.areas) {
          currentSettings.areas.forEach(area => {
            if (area.currentStatus === oldStatus) {
              area.currentStatus = trimmedNewStatus;
            }
          });
        }

        await saveSettings();
        showToast('修改成功', 'success');
      }
    });
  });

  // 刪除狀態
  document.querySelectorAll('.btn-del-area-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const status = e.currentTarget.dataset.status;
      const confirmed = await openConfirm({
        title: '刪除狀態',
        message: `確定要刪除「${status}」嗎？使用此狀態的區域將被重置回預設狀態。`,
        isDanger: true,
        confirmText: '確認刪除'
      });
      if (!confirmed) return;

      currentSettings.areaStatuses = currentSettings.areaStatuses.filter(s => s !== status);
      
      // 檢查是否有區域正在使用此狀態，若有則清空
      if (currentSettings.areas) {
        currentSettings.areas.forEach(area => {
          if (area.currentStatus === status) {
            area.currentStatus = '';
          }
        });
      }

      await saveSettings();
      showToast('刪除成功', 'success');
    });
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-area-status.js
V: 1792977000
W: UPGRADE-005
*/