import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { createIcons, Plus, GripVertical, X } from 'lucide';

/**
 * 建立並顯示「生產流程編輯器」的彈窗
 * @param {Object} options
 * @param {Object} options.currentSettings 當前的 settings 資料
 * @param {Array<string>} options.availableCategories 可選的類別清單
 * @param {string} options.defaultCategory 預設帶入的類別
 * @param {Function} options.onSave 儲存回呼 async (newTemplate) => {}
 */
export function openRouteBuilder({ currentSettings, availableCategories = [], defaultCategory = '', onSave }) {
  const statuses = currentSettings.statuses || [];
  const categories = [...new Set(availableCategories)].sort();

  const content = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-slate-700">流程名稱</label>
        <input type="text" id="builder-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="例如：標準生產流程">
      </div>
      
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-slate-700">對應類別 (可多選，留空為通用)</label>
        <div class="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto p-1">
          ${categories.length === 0 ? '<span class="text-xs text-slate-400">目前尚無工單類別</span>' : ''}
          ${categories.map(c => `
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="builder-cat-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${c}" ${c === defaultCategory ? 'checked' : ''}>
              <span class="text-slate-700">${c}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <p class="text-sm text-slate-500">點擊左側加入右側，或拖曳右側調整順序。</p>
        <div class="flex flex-col md:flex-row gap-4 h-[35vh]">
          <!-- 左側：可選工序 -->
          <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
            <h4 class="font-bold text-sm text-slate-700 mb-2">可選工序</h4>
            <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="builder-available-list"></div>
          </div>
          <!-- 右側：預計工序順序 -->
          <div class="flex-1 bg-white border border-slate-200 rounded-xl p-3 flex flex-col shadow-sm">
            <h4 class="font-bold text-sm text-slate-700 mb-2">預計工序順序</h4>
            <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="builder-selected-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const footer = `
    <div class="flex justify-end gap-3">
      <button id="builder-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
      <button id="builder-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 active:scale-95 transition-all">儲存並套用</button>
    </div>
  `;

  // 加入 size: 'max-w-4xl' 參數
  const { close, element } = openModal({ title: '新增生產流程', content, footer, size: 'max-w-4xl' });

  let currentSteps = [];
  let sortableInstance = null;

  const renderLists = () => {
    const availableList = element.querySelector('#builder-available-list');
    const selectedList = element.querySelector('#builder-selected-list');

    const availableStatuses = statuses.filter(s => !currentSteps.includes(s));

    if (availableStatuses.length === 0) {
      availableList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">所有工序已加入</div>';
    } else {
      availableList.innerHTML = availableStatuses.map(status => `
        <div class="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-brand transition-colors builder-available-item" data-step="${status}">
          <span class="flex-1 font-medium text-slate-700">${status}</span>
          <i data-lucide="plus" class="w-4 h-4 text-slate-400"></i>
        </div>
      `).join('');
    }

    if (currentSteps.length === 0) {
      selectedList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">請從左側加入工序</div>';
    } else {
      selectedList.innerHTML = currentSteps.map((step, idx) => `
        <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 builder-step-item" data-step="${step}">
          <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 cursor-grab"></i>
          <span class="flex-1 font-medium text-slate-700"><span class="text-slate-400 mr-1">${idx + 1}.</span>${step}</span>
          <button class="text-slate-400 hover:text-rose-500 builder-remove-step" data-step="${step}">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      `).join('');
    }

    createIcons({ icons: { Plus, GripVertical, X }, attrs: { class: 'w-4 h-4' } });

    // 左側點擊加入
    availableList.querySelectorAll('.builder-available-item').forEach(item => {
      item.addEventListener('click', () => {
        const step = item.dataset.step;
        if (!currentSteps.includes(step)) {
          currentSteps.push(step);
          renderLists();
        }
      });
    });

    // 右側移除
    selectedList.querySelectorAll('.builder-remove-step').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const step = ev.currentTarget.dataset.step;
        currentSteps = currentSteps.filter(s => s !== step);
        renderLists();
      });
    });

    // Sortable
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
          renderLists();
        }
      });
    }
  };

  renderLists();

  element.querySelector('#builder-cancel-btn').addEventListener('click', close);

  element.querySelector('#builder-confirm-btn').addEventListener('click', async () => {
    const name = element.querySelector('#builder-name').value.trim();
    const selectedCategories = Array.from(element.querySelectorAll('.builder-cat-checkbox:checked')).map(cb => cb.value);

    if (!name) {
      showToast('請輸入流程名稱', 'error');
      return;
    }
    if (currentSteps.length === 0) {
      showToast('流程工序不能為空', 'error');
      return;
    }

    const btn = element.querySelector('#builder-confirm-btn');
    btn.disabled = true;
    btn.textContent = '儲存中...';

    try {
      const newTemplate = {
        name,
        category: selectedCategories.join(','),
        categories: selectedCategories,
        steps: currentSteps
      };

      await onSave(newTemplate);
      close();
    } catch (err) {
      console.error(err);
      showToast('儲存失敗', 'error');
      btn.disabled = false;
      btn.textContent = '儲存並套用';
    }
  });
}

/*
F: AI-WA-UPWO/src/ui/route-builder.js
V: 1792959000
W: UPGRADE-005
*/