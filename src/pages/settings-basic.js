import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { getCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { createIcons, Plus, GripVertical, Trash2, Edit2 } from 'lucide';

/**
 * 渲染狀態管理頁籤
 */
export function renderStatuses(container, currentSettings, saveSettings) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">工序狀態管理</h2>
        <p class="text-sm text-slate-500 mt-1">可拖曳排序。修改名稱時會同步更新歷史工單。</p>
      </div>
    </div>
    
    <div class="flex gap-2 mb-6">
      <input type="text" id="new-status-input" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="輸入新狀態名稱...">
      <button id="btn-add-status" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="inset-panel p-4 flex flex-col gap-2" id="status-list">
      ${currentSettings.statuses.map((status, index) => `
        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm status-item" draggable="true" data-index="${index}">
          <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
          <span class="flex-1 font-medium text-slate-700 status-name">${status}</span>
          <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-status" data-status="${status}">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-status" data-status="${status}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, GripVertical, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  // 新增狀態
  document.getElementById('btn-add-status')?.addEventListener('click', async () => {
    const input = document.getElementById('new-status-input');
    const val = input.value.trim();
    if (!val) return;
    if (currentSettings.statuses.includes(val)) {
      showToast('狀態已存在', 'error');
      return;
    }
    currentSettings.statuses.push(val);
    await saveSettings();
    showToast('新增成功', 'success');
  });

  // 修改狀態
  document.querySelectorAll('.btn-edit-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const oldStatus = e.currentTarget.dataset.status;
      const newStatus = window.prompt(`修改狀態名稱（原為「${oldStatus}」）：`, oldStatus);
      if (!newStatus || newStatus.trim() === "" || newStatus === oldStatus) return;
      const trimmedNewStatus = newStatus.trim();

      showToast('正在更新狀態與歷史資料...', 'info');
      try {
        const idx = currentSettings.statuses.indexOf(oldStatus);
        if (idx !== -1) currentSettings.statuses[idx] = trimmedNewStatus;
        await saveSettings();

        const orders = await getCollection('work_orders');
        let updateCount = 0;
        for (const order of orders) {
          if (order.status === oldStatus) {
            await updateDocument('work_orders', order.id, { status: trimmedNewStatus });
            updateCount++;
          }
        }
        showToast(`已修改狀態，並同步更新 ${updateCount} 筆工單`, 'success');
      } catch (err) {
        showToast('修改失敗，請稍後再試', 'error');
      }
    });
  });

  // 刪除狀態
  document.querySelectorAll('.btn-del-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const status = e.currentTarget.dataset.status;
      const confirmed = await openConfirm({
        title: '刪除狀態',
        message: `確定要刪除「${status}」嗎？系統將檢查是否有工單處於此狀態。`,
        isDanger: true,
        confirmText: '檢查並刪除'
      });
      if (!confirmed) return;

      try {
        const orders = await getCollection('work_orders');
        const hasOrders = orders.some(o => o.status === status);
        if (hasOrders) {
          showToast(`無法刪除：仍有工單處於「${status}」狀態`, 'error');
          return;
        }
        currentSettings.statuses = currentSettings.statuses.filter(s => s !== status);
        await saveSettings();
        showToast('刪除成功', 'success');
      } catch (err) {
        showToast('檢查工單失敗', 'error');
      }
    });
  });

  // 拖曳排序
  const list = document.getElementById('status-list');
  if (list) {
    let draggedItem = null;

    list.querySelectorAll('.status-item').forEach(item => {
      item.addEventListener('dragstart', function() {
        draggedItem = this;
        setTimeout(() => this.classList.add('opacity-50'), 0);
      });
      item.addEventListener('dragend', function() {
        this.classList.remove('opacity-50');
        draggedItem = null;
        const newOrder = Array.from(list.querySelectorAll('.status-item')).map(el => el.querySelector('.status-name').textContent);
        currentSettings.statuses = newOrder;
        const saveHandler = async () => {
          await saveSettings();
          showToast('排序已更新', 'success');
        };
        saveHandler.call(this);
      });
      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (this === draggedItem) return;
        const rect = this.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        list.insertBefore(draggedItem, next ? this.nextSibling : this);
      });
    });
  }
}

/**
 * 渲染銷售員對照表管理頁籤
 */
export function renderMapping(container, currentSettings, saveSettings) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">銷售員對照表</h2>
        <p class="text-sm text-slate-500 mt-1">設定別名，匯入時自動對應。修改後會自動同步歷史工單。</p>
      </div>
    </div>

    <div class="flex gap-2 mb-6">
      <input type="text" id="new-rep-name" class="w-1/3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="正式名稱 (例：王小明)">
      <input type="text" id="new-rep-alias" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="別名，用逗號隔開 (例：123, S-123)">
      <button id="btn-add-rep" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="flex flex-col gap-2">
      ${currentSettings.sales_mapping.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無對照表資料</div>' : ''}
      ${currentSettings.sales_mapping.map((rep, index) => `
        <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div class="w-1/3 font-bold text-slate-800">${rep.name}</div>
          <div class="flex-1 flex flex-wrap gap-1">
            ${(rep.aliases || []).map(a => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${a}</span>`).join('')}
          </div>
          <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-rep" data-index="${index}">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-rep" data-index="${index}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  document.getElementById('btn-add-rep')?.addEventListener('click', async () => {
    const name = document.getElementById('new-rep-name').value.trim();
    const aliasStr = document.getElementById('new-rep-alias').value.trim();
    if (!name || !aliasStr) {
      showToast('請輸入正式名稱與至少一個別名', 'error');
      return;
    }
    
    const aliases = aliasStr.split(',').map(s => s.trim()).filter(Boolean);
    currentSettings.sales_mapping.push({ name, aliases });
    await saveSettings();

    showToast('正在同步歷史工單...', 'info');
    try {
      const orders = await getCollection('work_orders');
      let updateCount = 0;
      for (const order of orders) {
        let reps = order.salesReps || [];
        let changed = false;
        aliases.forEach(alias => {
          if (reps.includes(alias)) {
            reps = reps.filter(r => r !== alias);
            reps.push(name);
            changed = true;
          }
        });
        if (changed) {
          await updateDocument('work_orders', order.id, { salesReps: [...new Set(reps)] });
          updateCount++;
        }
      }
      showToast(`新增成功，同步更新了 ${updateCount} 筆工單`, 'success');
    } catch (err) {
      showToast('對照表已新增，但同步歷史資料失敗', 'error');
    }
  });

  // 修改為單一表單彈窗
  document.querySelectorAll('.btn-edit-rep').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = e.currentTarget.dataset.index;
      const oldRep = currentSettings.sales_mapping[idx];

      const content = `
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">正式名稱</label>
            <input type="text" id="edit-rep-name" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand" value="${oldRep.name}">
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">別名 (用逗號隔開)</label>
            <input type="text" id="edit-rep-alias" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand" value="${(oldRep.aliases||[]).join(', ')}">
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 active:scale-95 transition-all">儲存</button>
        </div>
      `;

      const { close, element } = openModal({ title: '編輯銷售員', content });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-rep-name').value.trim();
        const newAliasStr = element.querySelector('#edit-rep-alias').value.trim();

        if (!newName) {
          showToast('正式名稱不能為空', 'error');
          return;
        }

        if (newName === oldRep.name && newAliasStr === (oldRep.aliases||[]).join(', ')) {
          close();
          return;
        }

        const confirmBtn = element.querySelector('#modal-confirm-btn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '更新中...';

        showToast('正在更新設定與歷史資料...', 'info');
        try {
          const newAliases = newAliasStr.split(',').map(s => s.trim()).filter(Boolean);
          currentSettings.sales_mapping[idx] = { name: newName, aliases: newAliases };
          await saveSettings();

          const orders = await getCollection('work_orders');
          let updateCount = 0;
          for (const order of orders) {
            let reps = order.salesReps || [];
            let changed = false;
            if (reps.includes(oldRep.name)) {
              reps = reps.filter(r => r !== oldRep.name);
              reps.push(newName);
              changed = true;
            }
            (oldRep.aliases || []).forEach(alias => {
              if (reps.includes(alias)) {
                reps = reps.filter(r => r !== alias);
                reps.push(newName);
                changed = true;
              }
            });
            if (changed) {
              await updateDocument('work_orders', order.id, { salesReps: [...new Set(reps)] });
              updateCount++;
            }
          }
          showToast(`修改成功，同步更新了 ${updateCount} 筆工單`, 'success');
          close();
        } catch (err) {
          console.error(err);
          showToast('修改失敗，請稍後再試', 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = '儲存';
        }
      });
    });
  });

  document.querySelectorAll('.btn-del-rep').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = e.currentTarget.dataset.index;
      currentSettings.sales_mapping.splice(idx, 1);
      await saveSettings();
      showToast('刪除成功', 'success');
    });
  });
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/settings-basic.js
V: 1792919600
W: UPGRADE-004
═══ */