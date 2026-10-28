import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { createIcons, Plus, Trash2, Edit2, LayoutDashboard, Table, PieChart, Layers, Users, GripVertical, X, Check } from 'lucide';

let activeViewPage = 'kanban';

/**
 * 渲染欄位管理頁籤
 */
export function renderSchema(container, currentSettings, saveSettings) {
  const sysFields = currentSettings.schema.filter(f => f.isSystem);
  const customFields = currentSettings.schema.filter(f => !f.isSystem);

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">動態欄位管理</h2>
        <p class="text-sm text-slate-500 mt-1">定義系統欄位。新增後可至「視圖配置」決定顯示於何處。</p>
      </div>
    </div>

    <div class="flex gap-2 mb-6">
      <input type="text" id="new-field-label" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="新增欄位名稱 (例如：利潤)">
      <button id="btn-add-field" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <i data-lucide="plus" class="w-4 h-4"></i> 新增
      </button>
    </div>

    <div class="mb-4 text-sm font-semibold text-slate-600">系統核心欄位（不可刪除）</div>
    <div class="flex flex-col gap-2 mb-8">
      ${sysFields.map(f => `
        <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="w-1/3 font-bold text-slate-700">${f.label}</div>
          <div class="w-1/3 text-slate-400 font-mono text-xs">${f.key}</div>
          <div class="w-1/3 text-right text-slate-400 text-xs">系統保護</div>
        </div>
      `).join('')}
    </div>

    <div class="mb-4 text-sm font-semibold text-slate-600">自訂欄位</div>
    <div class="flex flex-col gap-2">
      ${customFields.length === 0 ? '<div class="text-slate-400 text-sm py-2">目前尚無自訂欄位</div>' : ''}
      ${customFields.map((f, index) => `
        <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div class="w-1/3 font-bold text-slate-800">${f.label}</div>
          <div class="w-1/3 text-slate-500 font-mono text-xs">${f.key}</div>
          <div class="w-1/3 flex justify-end gap-2">
            <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-field" data-key="${f.key}" data-label="${f.label}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-field" data-key="${f.key}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  document.getElementById('btn-add-field')?.addEventListener('click', async () => {
    const input = document.getElementById('new-field-label');
    const val = input.value.trim();
    if (!val) return;
    
    const key = 'field_' + Date.now().toString(36);
    currentSettings.schema.push({ key, label: val, type: 'string', isSystem: false });
    await saveSettings();
    showToast('新增成功，可至視圖配置勾選顯示', 'success');
  });

  document.querySelectorAll('.btn-edit-field').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.currentTarget.dataset.key;
      const oldLabel = e.currentTarget.dataset.label;
      const newLabel = window.prompt(`修改欄位名稱（原為「${oldLabel}」）：`, oldLabel);
      if (!newLabel || newLabel.trim() === "" || newLabel === oldLabel) return;
      
      const idx = currentSettings.schema.findIndex(f => f.key === key);
      if (idx !== -1) {
        currentSettings.schema[idx].label = newLabel.trim();
        await saveSettings();
        showToast('修改成功', 'success');
      }
    });
  });

  document.querySelectorAll('.btn-del-field').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.currentTarget.dataset.key;
      const confirmed = await openConfirm({
        title: '刪除自訂欄位',
        message: `確定要刪除該欄位嗎？(歷史資料將保留，僅不再顯示)`,
        isDanger: true
      });
      if (!confirmed) return;
      
      currentSettings.schema = currentSettings.schema.filter(f => f.key !== key);
      Object.keys(currentSettings.view_configs).forEach(page => {
        currentSettings.view_configs[page] = currentSettings.view_configs[page].filter(k => k !== key);
      });
      
      await saveSettings();
      showToast('已刪除欄位', 'success');
    });
  });
}

/**
 * 渲染視圖配置頁籤（雙清單拖曳排序）
 */
export function renderViewConfig(container, currentSettings, saveSettings) {
  const pages = [
    { key: 'kanban', label: '工單進度表', icon: 'layout-dashboard' },
    { key: 'table', label: '管理總表', icon: 'table' },
    { key: 'overview', label: '總狀態視圖', icon: 'pie-chart' },
    { key: 'category', label: '類別視圖', icon: 'layers' },
    { key: 'salesperson', label: '銷售員視圖', icon: 'users' }
  ];

  // 取得當前頁面已顯示的欄位（保持自訂順序）
  const activeFields = currentSettings.view_configs[activeViewPage] || [];
  const visibleSchema = activeFields.map(k => currentSettings.schema.find(f => f.key === k)).filter(Boolean);
  
  // 取得未顯示的欄位（存在於 schema 但不在 activeFields 中）
  const hiddenSchema = currentSettings.schema.filter(f => !activeFields.includes(f.key));

  container.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-800">視圖配置與排序</h2>
        <p class="text-sm text-slate-500 mt-1">選擇頁面，並左右拖曳或點擊來決定顯示的欄位與順序。</p>
      </div>
      <select id="view-page-select" class="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none">
        ${pages.map(p => `<option value="${p.key}" ${p.key === activeViewPage ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 已顯示欄位 -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col shadow-sm">
        <h3 class="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <i data-lucide="check" class="w-4 h-4 text-emerald-500"></i> 已顯示欄位（可拖曳排序）
        </h3>
        <div class="flex flex-col gap-2 min-h-[200px]" id="visible-list">
          ${visibleSchema.length === 0 ? '<div class="text-slate-400 text-sm text-center py-8">無顯示欄位，請從右側加入</div>' : ''}
          ${visibleSchema.map(f => `
            <div class="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-grab visible-item" draggable="true" data-key="${f.key}">
              <i data-lucide="grip-vertical" class="w-5 h-5 text-slate-300"></i>
              <span class="flex-1 font-medium text-slate-700">${f.label}</span>
              <button class="p-1 text-slate-400 hover:text-rose-500 btn-remove-field" data-key="${f.key}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 未顯示欄位 -->
      <div class="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col">
        <h3 class="font-bold text-slate-600 mb-4 flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 未顯示欄位（點擊加入）
        </h3>
        <div class="flex flex-col gap-2">
          ${hiddenSchema.length === 0 ? '<div class="text-slate-400 text-sm text-center py-8">所有欄位已顯示</div>' : ''}
          ${hiddenSchema.map(f => `
            <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:border-brand transition-colors hidden-item" data-key="${f.key}">
              <span class="flex-1 font-medium text-slate-600">${f.label}</span>
              <i data-lucide="plus" class="w-4 h-4 text-slate-400"></i>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  createIcons({ icons: { Check, Plus, GripVertical, X }, attrs: { class: 'w-4 h-4' } });

  // 頁面切換
  document.getElementById('view-page-select')?.addEventListener('change', (e) => {
    activeViewPage = e.target.value;
    renderViewConfig(container, currentSettings, saveSettings);
  });

  // 加入欄位 (從未顯示區)
  container.querySelectorAll('.hidden-item').forEach(item => {
    item.addEventListener('click', async () => {
      const key = item.dataset.key;
      currentSettings.view_configs[activeViewPage].push(key);
      await saveSettings();
      showToast('已加入顯示', 'success');
    });
  });

  // 移除欄位 (從已顯示區)
  container.querySelectorAll('.btn-remove-field').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // 防止觸發拖曳
      const key = btn.dataset.key;
      currentSettings.view_configs[activeViewPage] = currentSettings.view_configs[activeViewPage].filter(k => k !== key);
      await saveSettings();
      showToast('已從顯示移除', 'success');
    });
  });

  // 拖曳排序
  const list = document.getElementById('visible-list');
  if (list) {
    let draggedItem = null;

    list.querySelectorAll('.visible-item').forEach(item => {
      item.addEventListener('dragstart', function(e) {
        draggedItem = this;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => this.classList.add('opacity-50'), 0);
      });

      item.addEventListener('dragend', async function() {
        this.classList.remove('opacity-50');
        draggedItem = null;
        
        // 收集新順序
        const newOrder = Array.from(list.querySelectorAll('.visible-item')).map(el => el.dataset.key);
        currentSettings.view_configs[activeViewPage] = newOrder;
        
        await saveSettings();
        showToast('順序已更新', 'success');
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

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/settings-schema.js
V: 1792919700
W: UPGRADE-004
═══ */