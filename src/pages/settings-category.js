import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { getCollection } from '../db/read.js';
import { createIcons, Plus, GripVertical, Trash2, Edit2, RefreshCw } from 'lucide';

/**
 * 渲染「類別管理」頁籤
 * @param {HTMLElement} container 目標容器
 * @param {Object} currentSettings settings/main 的內容（含 categories）
 * @param {Function} saveSettings 儲存回呼（async）
 */
export function renderCategories(container, currentSettings, saveSettings) {
  const categories = currentSettings.categories || [];

  container.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-800">工單類別管理</h2>
        <p class="text-sm text-slate-500 mt-1">可拖曳排序。新增類別後，可用於過濾工單與設定區域。</p>
      </div>
      <div>
        <button id="btn-sync-categories" class="bg-white text-brand border border-brand/30 px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand/5 flex items-center gap-2 shadow-sm transition-colors">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> 從工單同步類別
        </button>
      </div>
    </div>

    <div class="flex gap-2 mb-6">
      <input type="text" id="new-category-input" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="輸入新類別名稱 (例如：UG)">
      <button id="btn-add-category" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="inset-panel p-4 flex flex-col gap-2" id="category-list">
      ${categories.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無類別，請先新增</div>' : ''}
      ${categories.map((cat, index) => `
        <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm category-item" data-index="${index}">
          <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300 cursor-grab"></i>
          <span class="flex-1 font-medium text-slate-700 category-name">${cat}</span>
          <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-category" data-category="${cat}">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-category" data-category="${cat}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, GripVertical, Trash2, Edit2, RefreshCw }, attrs: { class: 'w-4 h-4' } });

  // 初始化拖曳排序
  const categoryList = document.getElementById('category-list');
  if (categoryList && categories.length > 1) {
    new Sortable(categoryList, {
      animation: 150,
      handle: '.cursor-grab',
      ghostClass: 'opacity-50',
      forceFallback: true,
      fallbackTolerance: 3,
      onEnd: async () => {
        const newOrder = Array.from(categoryList.children).map(el => el.querySelector('.category-name').textContent);
        currentSettings.categories = newOrder;
        await saveSettings();
        showToast('類別排序已更新', 'success');
      }
    });
  }

  // 💡 從工單同步類別
  document.getElementById('btn-sync-categories')?.addEventListener('click', async () => {
    showToast('正在掃描工單類別...', 'info');
    try {
      const orders = await getCollection('work_orders');
      const currentCats = new Set(categories);
      let addedCount = 0;

      orders.forEach(o => {
        let cat = '';
        if (o.data && o.data.category) {
          cat = String(o.data.category).toUpperCase();
        } else {
          const match = String(o.id).match(/^[a-zA-Z]+/);
          cat = match ? match[0].toUpperCase() : '其他';
        }

        if (cat && cat !== '其他' && !currentCats.has(cat)) {
          currentCats.add(cat);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        currentSettings.categories = Array.from(currentCats).sort();
        await saveSettings();
        showToast(`已自動補齊 ${addedCount} 個新類別`, 'success');
      } else {
        showToast('所有工單類別皆已存在，無需補齊', 'info');
      }
    } catch (err) {
      console.error(err);
      showToast('同步失敗，請查看 Console', 'error');
    }
  });

  // 新增類別
  document.getElementById('btn-add-category')?.addEventListener('click', async () => {
    const input = document.getElementById('new-category-input');
    const val = input.value.trim().toUpperCase();
    if (!val) return;
    if (!currentSettings.categories) currentSettings.categories = [];
    if (currentSettings.categories.includes(val)) {
      showToast('類別已存在', 'error');
      return;
    }
    currentSettings.categories.push(val);
    await saveSettings();
    showToast('新增成功', 'success');
  });

  // 修改類別
  document.querySelectorAll('.btn-edit-category').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const oldCat = e.currentTarget.dataset.category;
      const newCat = window.prompt(`修改類別名稱（原為「${oldCat}」）：`, oldCat);
      if (!newCat || newCat.trim() === "" || newCat === oldCat) return;
      const trimmedNewCat = newCat.trim().toUpperCase();

      if (currentSettings.categories.includes(trimmedNewCat)) {
        showToast('該類別名稱已存在', 'error');
        return;
      }

      const idx = currentSettings.categories.indexOf(oldCat);
      if (idx !== -1) {
        currentSettings.categories[idx] = trimmedNewCat;
        await saveSettings();
        showToast('修改成功', 'success');
      }
    });
  });

  // 刪除類別
  document.querySelectorAll('.btn-del-category').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const cat = e.currentTarget.dataset.category;
      const confirmed = await openConfirm({
        title: '刪除類別',
        message: `確定要刪除「${cat}」嗎？此操作不會影響已存在的工單資料。`,
        isDanger: true,
        confirmText: '確認刪除'
      });
      if (!confirmed) return;

      currentSettings.categories = currentSettings.categories.filter(c => c !== cat);
      await saveSettings();
      showToast('刪除成功', 'success');
    });
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-category.js
V: 1793070000
W: UPGRADE-007
*/