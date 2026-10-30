import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { createIcons, Plus, Trash2, Edit2, X, MapPin, ChevronUp, ChevronDown } from 'lucide';

/**
 * 渲染「區域管理」頁籤
 * - 新增／改名／刪除區域
 * - 上下按鈕排序區域
 * - 雙清單綁定工序（上下按鈕排序）
 * - 一個工序最多屬於一個區域（已在其他區域的工序顯示為已綁定並禁用）
 *
 * @param {HTMLElement} container 目標容器
 * @param {Object} currentSettings settings/main 的內容（含 areas、statuses）
 * @param {Function} saveSettings 儲存回呼（async）
 */
export function renderAreas(container, currentSettings, saveSettings) {
  const areas = currentSettings.areas || [];
  const statuses = currentSettings.statuses || [];

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">區域管理</h2>
        <p class="text-sm text-slate-500 mt-1">使用上下箭頭排序。新增區域並綁定工序。一個工序最多屬於一個區域；未綁定的工序會歸入「未分配區域」。</p>
      </div>
    </div>

    <div class="flex gap-2 mb-6">
      <input type="text" id="new-area-name" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" placeholder="區域名稱 (例如：四色印刷機)">
      <button id="btn-add-area" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增區域
      </button>
    </div>

    <div class="flex flex-col gap-3" id="area-list">
      ${areas.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無區域，請先新增</div>' : ''}
      ${areas.map((area, index) => {
        const boundStatuses = area.statuses || [];
        const isFirst = index === 0;
        const isLast = index === areas.length - 1;
        return `
          <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm area-item" data-index="${index}">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div class="flex flex-col items-center gap-0.5 mr-1">
                  <button class="p-1 text-slate-400 hover:text-brand btn-move-area-up ${isFirst ? 'opacity-30' : ''}" data-index="${index}" ${isFirst ? 'disabled' : ''}>
                    <i data-lucide="chevron-up" class="w-4 h-4"></i>
                  </button>
                  <button class="p-1 text-slate-400 hover:text-brand btn-move-area-down ${isLast ? 'opacity-30' : ''}" data-index="${index}" ${isLast ? 'disabled' : ''}>
                    <i data-lucide="chevron-down" class="w-4 h-4"></i>
                  </button>
                </div>
                <i data-lucide="map-pin" class="w-5 h-5 text-brand"></i>
                <span class="font-bold text-slate-800 area-name">${area.name}</span>
                <span class="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">${boundStatuses.length} 個工序</span>
              </div>
              <div class="flex items-center gap-2">
                <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-area" data-index="${index}">
                  <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-area" data-index="${index}">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
              ${boundStatuses.length === 0 ? '<span class="text-slate-400">尚未綁定工序，點擊編輯加入</span>' : ''}
              ${boundStatuses.map((s, i) => `
                <span class="px-2 py-1 bg-white border border-slate-200 rounded-md"><span class="text-slate-400 mr-1 text-xs">${i+1}.</span>${s}</span>
                ${i < boundStatuses.length - 1 ? '<span class="text-slate-300">➔</span>' : ''}
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2, MapPin, ChevronUp, ChevronDown }, attrs: { class: 'w-4 h-4' } });

  // ── 新增區域 ──
  document.getElementById('btn-add-area')?.addEventListener('click', async () => {
    const input = document.getElementById('new-area-name');
    const name = input.value.trim();
    if (!name) {
      showToast('請輸入區域名稱', 'error');
      return;
    }
    if ((currentSettings.areas || []).some(a => a.name === name)) {
      showToast('區域名稱已存在', 'error');
      return;
    }
    const id = 'area_' + Date.now().toString(36);
    if (!currentSettings.areas) currentSettings.areas = [];
    currentSettings.areas.push({ id, name, statuses: [] });
    await saveSettings();
    showToast('區域已新增', 'success');
  });

  // ── 刪除區域 ──
  document.querySelectorAll('.btn-del-area').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const area = areas[idx];
      const confirmed = await openConfirm({
        title: '刪除區域',
        message: `確定要刪除「${area.name}」嗎？綁定的工序將回到未分配狀態。`,
        isDanger: true,
        confirmText: '確認刪除'
      });
      if (!confirmed) return;
      currentSettings.areas.splice(idx, 1);
      await saveSettings();
      showToast('區域已刪除', 'success');
    });
  });

  // ── 區域上下排序 ──
  document.querySelectorAll('.btn-move-area-up').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      if (idx > 0) {
        [currentSettings.areas[idx - 1], currentSettings.areas[idx]] = [currentSettings.areas[idx], currentSettings.areas[idx - 1]];
        await saveSettings();
        showToast('區域順序已更新', 'success');
      }
    });
  });

  document.querySelectorAll('.btn-move-area-down').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      if (idx < currentSettings.areas.length - 1) {
        [currentSettings.areas[idx + 1], currentSettings.areas[idx]] = [currentSettings.areas[idx], currentSettings.areas[idx + 1]];
        await saveSettings();
        showToast('區域順序已更新', 'success');
      }
    });
  });

  // ── 編輯區域（改名 + 雙清單綁定工序） ──
  document.querySelectorAll('.btn-edit-area').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const area = areas[idx];

      // 建立「其他區域已綁定」的工序映射（用於禁用與提示）
      const otherAreaStatusMap = {};
      currentSettings.areas.forEach((a, i) => {
        if (i === idx) return;
        (a.statuses || []).forEach(s => {
          otherAreaStatusMap[s] = a.name;
        });
      });

      const content = `
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-slate-700">區域名稱</label>
            <input type="text" id="edit-area-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${area.name}">
          </div>
          <div class="flex flex-col gap-2">
            <p class="text-sm text-slate-500">點擊左側加入右側，或使用上下箭頭調整順序。已綁定至其他區域的工序需先從該區域移除。</p>
            <div class="flex flex-col md:flex-row gap-4 h-[40vh]">
              <!-- 左側：可選工序 -->
              <div class="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
                <h4 class="font-bold text-sm text-slate-700 mb-2">可選工序</h4>
                <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="modal-available-list"></div>
              </div>
              <!-- 右側：已綁定工序順序 -->
              <div class="flex-1 bg-white border border-slate-200 rounded-xl p-3 flex flex-col shadow-sm">
                <h4 class="font-bold text-sm text-slate-700 mb-2">已綁定工序順序</h4>
                <div class="flex-1 overflow-y-auto flex flex-col gap-2" id="modal-selected-list"></div>
              </div>
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

      const { close, element } = openModal({ title: `編輯區域`, content, footer });

      let currentSteps = Array.from(area.statuses || []);

      const renderModalLists = () => {
        const availableList = element.querySelector('#modal-available-list');
        const selectedList = element.querySelector('#modal-selected-list');

        // 可選：不在 currentSteps 中的工序
        const availableStatuses = statuses.filter(s => !currentSteps.includes(s));

        if (availableStatuses.length === 0) {
          availableList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">所有工序已加入</div>';
        } else {
          availableList.innerHTML = availableStatuses.map(status => {
            const boundTo = otherAreaStatusMap[status];
            const isBlocked = !!boundTo;
            return `
              <div class="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 ${isBlocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-brand transition-colors'} available-item" data-step="${status}" data-blocked="${isBlocked ? '1' : '0'}">
                <span class="flex-1 font-medium text-slate-700">${status}</span>
                ${isBlocked
                  ? `<span class="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded whitespace-nowrap">已綁定：${boundTo}</span>`
                  : `<i data-lucide="plus" class="w-4 h-4 text-slate-400"></i>`
                }
              </div>
            `;
          }).join('');
        }

        if (currentSteps.length === 0) {
          selectedList.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">請從左側加入工序</div>';
        } else {
          selectedList.innerHTML = currentSteps.map((step, i) => `
            <div class="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 step-item">
              <div class="flex flex-col items-center gap-0.5">
                <button class="p-1 text-slate-400 hover:text-brand btn-move-up ${i === 0 ? 'opacity-30' : ''}" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>
                  <i data-lucide="chevron-up" class="w-4 h-4"></i>
                </button>
                <button class="p-1 text-slate-400 hover:text-brand btn-move-down ${i === currentSteps.length - 1 ? 'opacity-30' : ''}" data-idx="${i}" ${i === currentSteps.length - 1 ? 'disabled' : ''}>
                  <i data-lucide="chevron-down" class="w-4 h-4"></i>
                </button>
              </div>
              <span class="flex-1 font-medium text-slate-700"><span class="text-slate-400 mr-1">${i + 1}.</span>${step}</span>
              <button class="text-slate-400 hover:text-rose-500 btn-remove-step" data-step="${step}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('');
        }

        createIcons({ icons: { Plus, ChevronUp, ChevronDown, X }, attrs: { class: 'w-4 h-4' } });

        // 左側點擊加入
        availableList.querySelectorAll('.available-item').forEach(item => {
          item.addEventListener('click', () => {
            if (item.dataset.blocked === '1') {
              showToast('此工序已綁定至其他區域，請先移除該綁定', 'error');
              return;
            }
            const step = item.dataset.step;
            if (!currentSteps.includes(step)) {
              currentSteps.push(step);
              renderModalLists();
            }
          });
        });

        // 右側移除
        selectedList.querySelectorAll('.btn-remove-step').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            const step = ev.currentTarget.dataset.step;
            currentSteps = currentSteps.filter(s => s !== step);
            renderModalLists();
          });
        });

        // 右側上移
        selectedList.querySelectorAll('.btn-move-up').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            const i = parseInt(ev.currentTarget.dataset.idx);
            if (i > 0) {
              [currentSteps[i - 1], currentSteps[i]] = [currentSteps[i], currentSteps[i - 1]];
              renderModalLists();
            }
          });
        });

        // 右側下移
        selectedList.querySelectorAll('.btn-move-down').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            const i = parseInt(ev.currentTarget.dataset.idx);
            if (i < currentSteps.length - 1) {
              [currentSteps[i + 1], currentSteps[i]] = [currentSteps[i], currentSteps[i + 1]];
              renderModalLists();
            }
          });
        });
      };

      renderModalLists();

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-area-name').value.trim();
        if (!newName) {
          showToast('區域名稱不能為空', 'error');
          return;
        }
        if (currentSettings.areas.some((a, i) => i !== idx && a.name === newName)) {
          showToast('區域名稱已存在', 'error');
          return;
        }

        currentSettings.areas[idx].name = newName;
        currentSettings.areas[idx].statuses = currentSteps;

        await saveSettings();
        showToast('區域已更新', 'success');
        close();
      });
    });
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-area.js
V: 1792945000
W: UPGRADE-005
*/