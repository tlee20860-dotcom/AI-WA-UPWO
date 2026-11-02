import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { getCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { createIcons, Plus, GripVertical, Trash2, Edit2, Star, Settings2, X, Check } from 'lucide';

/**
 * 渲染狀態管理頁籤
 */
export function renderStatuses(container, currentSettings, saveSettings) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">工序狀態管理</h2>
        <p class="text-sm text-slate-500 mt-1">可拖曳排序。修改名稱時會同步更新歷史工單與區域綁定。</p>
      </div>
    </div>
    
    <div class="flex gap-2 mb-6">
      <input type="text" id="new-status-input" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="輸入新狀態名稱&#8230;">
      <button id="btn-add-status" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="inset-panel p-4 flex flex-col gap-2" id="status-list">
      ${currentSettings.statuses.map((status, index) => `
        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm status-item" data-index="${index}">
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

  // 初始化 SortableJS（狀態排序）
  const statusList = document.getElementById('status-list');
  if (statusList) {
    new Sortable(statusList, {
      animation: 150,
      handle: '.cursor-grab',
      ghostClass: 'opacity-50',
      onEnd: async function (evt) {
        const newOrder = Array.from(statusList.children).map(el => el.querySelector('.status-name').textContent);
        currentSettings.statuses = newOrder;
        await saveSettings();
        showToast('排序已更新', 'success');
      }
    });
  }

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

        // 同步更新區域綁定中的工序名稱
        if (Array.isArray(currentSettings.areas)) {
          currentSettings.areas.forEach(area => {
            if (Array.isArray(area.statuses)) {
              area.statuses = area.statuses.map(s => s === oldStatus ? trimmedNewStatus : s);
            }
          });
        }

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
        message: `確定要刪除「${status}」嗎？系統將檢查是否有工單處於此狀態，並同步從區域綁定中移除。`,
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

        // 同步從區域綁定中移除該工序
        if (Array.isArray(currentSettings.areas)) {
          currentSettings.areas.forEach(area => {
            if (Array.isArray(area.statuses)) {
              area.statuses = area.statuses.filter(s => s !== status);
            }
          });
        }

        await saveSettings();
        showToast('刪除成功', 'success');
      } catch (err) {
        showToast('檢查工單失敗', 'error');
      }
    });
  });
}

/**
 * 渲染製程路線圖管理頁籤（支援多選類別）
 */
export function renderRouteTemplates(container, currentSettings, saveSettings) {
  const categories = currentSettings.categories || [];

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">製程路線圖管理</h2>
        <p class="text-sm text-slate-500 mt-1">建立生產路線並綁定類別。若多個類別共用相同路線，可同時勾選。</p>
      </div>
    </div>

    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col gap-3">
      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" id="new-template-name" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="路線圖名稱 (例如：卷裝LABEL生產流程)">
        <button id="btn-add-template" class="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增路線圖
        </button>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-slate-700">對應類別 (可多選，全不選為通用預設)</label>
        <div class="flex flex-wrap gap-2">
          ${categories.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何類別</span>' : ''}
          ${categories.map(c => `
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="new-tmpl-cat-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${c}">
              <span class="text-slate-700">${c}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      ${currentSettings.route_templates.map((tmpl, index) => {
        // 💡 向下相容：舊資料可能是 category 字串
        const cats = Array.isArray(tmpl.categories) ? tmpl.categories : (tmpl.category ? [tmpl.category] : []);
        
        return `
        <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-800 text-base">${tmpl.name}</span>
              ${cats.length > 0 
                ? cats.map(c => `<span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">${c}</span>`).join('')
                : `<span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded">通用預設</span>`
              }
            </div>
            <div class="flex items-center gap-2">
              <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-template" data-index="${index}">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-template" data-index="${index}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
            ${tmpl.steps.length === 0 ? '<span class="text-slate-400">無設定工序</span>' : ''}
            ${tmpl.steps.map((s, i) => `
              <span class="px-2 py-1 bg-white border border-slate-200 rounded-md"><span class="text-slate-400 mr-1 text-xs">${i+1}.</span>${s}</span>
              ${i < tmpl.steps.length - 1 ? '<span class="text-slate-300">➔</span>' : ''}
            `).join('')}
          </div>
        </div>
      `}).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  // 新增模板
  document.getElementById('btn-add-template')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-template-name');
    const name = nameInput.value.trim();
    
    if (!name) return;
    if (currentSettings.route_templates.some(t => t.name === name)) {
      showToast('名稱已存在', 'error');
      return;
    }
    
    // 💡 收集勾選的多個類別
    const selectedCats = Array.from(container.querySelectorAll('.new-tmpl-cat-cb:checked')).map(cb => cb.value);
    
    currentSettings.route_templates.push({ name, categories: selectedCats, steps: [] });
    await saveSettings();
    showToast('路線圖已新增，請編輯工序', 'success');
  });

  // 刪除模板
  document.querySelectorAll('.btn-del-template').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = e.currentTarget.dataset.index;
      const confirmed = await openConfirm({
        title: '刪除路線圖',
        message: '確定要刪除此路線圖嗎？',
        isDanger: true
      });
      if (!confirmed) return;
      currentSettings.route_templates.splice(idx, 1);
      await saveSettings();
      showToast('已刪除', 'success');
    });
  });

  // 編輯模板（左右雙清單與基本資料）
  document.querySelectorAll('.btn-edit-template').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const tmpl = currentSettings.route_templates[idx];
      const selectedCats = Array.isArray(tmpl.categories) ? tmpl.categories : (tmpl.category ? [tmpl.category] : []);
      
      const content = `
        <div class="flex flex-col gap-4 mb-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-slate-700">路線圖名稱</label>
            <input type="text" id="edit-tmpl-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" value="${tmpl.name}">
          </div>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">對應類別 (可多選，全不選為通用)</label>
            <div class="flex flex-wrap gap-2">
              ${categories.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何類別</span>' : ''}
              ${categories.map(c => `
                <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                  <input type="checkbox" class="edit-tmpl-cat-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${c}" ${selectedCats.includes(c) ? 'checked' : ''}>
                  <span class="text-slate-700">${c}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2 mt-4">
          <p class="text-sm text-slate-500">點擊左側加入右側，或長按左側把手拖曳調整順序。</p>
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

      const { close, element } = openModal({ title: `編輯路線圖`, content, footer, size: 'max-w-4xl' });
      
      let currentSteps = Array.from(tmpl.steps);
      let sortableInstance = null;

      const renderModalLists = () => {
        const availableList = element.querySelector('#modal-available-list');
        const selectedList = element.querySelector('#modal-selected-list');
        
        const availableStatuses = currentSettings.statuses.filter(s => !currentSteps.includes(s));

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
          selectedList.innerHTML = currentSteps.map((step, i) => `
            <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 step-item" data-step="${step}">
              <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 cursor-grab"></i>
              <span class="flex-1 font-medium text-slate-700"><span class="text-slate-400 mr-1">${i + 1}.</span>${step}</span>
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

        // 銷毀舊的 Sortable 實例
        if (sortableInstance) {
          sortableInstance.destroy();
        }

        // 綁定右側拖曳 (使用 SortableJS，加入 forceFallback 解決手機滾動衝突)
        if (currentSteps.length > 0) {
          sortableInstance = new Sortable(selectedList, {
            animation: 150,
            handle: '.cursor-grab',
            ghostClass: 'opacity-50',
            forceFallback: true,
            fallbackTolerance: 3,
            onEnd: () => {
              currentSteps = Array.from(selectedList.children).map(el => el.dataset.step);
              renderModalLists(); // 重新渲染以更新序號
            }
          });
        }
      };

      renderModalLists();

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-tmpl-name').value.trim();
        const newCategories = Array.from(element.querySelectorAll('.edit-tmpl-cat-cb:checked')).map(cb => cb.value);
        
        if (!newName) {
          showToast('名稱不能為空', 'error');
          return;
        }

        currentSettings.route_templates[idx].name = newName;
        currentSettings.route_templates[idx].categories = newCategories;
        // 清除舊的單選欄位以避免混淆
        if (currentSettings.route_templates[idx].category) {
          delete currentSettings.route_templates[idx].category;
        }
        currentSettings.route_templates[idx].steps = currentSteps;
        
        await saveSettings();
        showToast('路線圖已更新', 'success');
        close();
      });
    });
  });
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
          await updateDocument('work_orders', order.id, { salesReps: Array.from(new Set(reps)) });
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
      `;

      const footer = `
        <div class="flex justify-end gap-3">
          <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 active:scale-95 transition-all">儲存</button>
        </div>
      `;

      const { close, element } = openModal({ title: '編輯銷售員', content, footer });

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
              await updateDocument('work_orders', order.id, { salesReps: Array.from(new Set(reps)) });
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

/*
F: AI-WA-UPWO/src/pages/settings-basic.js
V: 1793046000
W: UPGRADE-007
*/