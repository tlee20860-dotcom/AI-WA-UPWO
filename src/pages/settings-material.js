import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { createIcons, Plus, Trash2, Edit2, GripVertical, X, Save } from 'lucide';

/**
 * 渲染物料管理頁面
 * @param {HTMLElement} container 目標容器
 * @param {Object} currentSettings settings/main 的內容
 * @param {Function} saveSettings 儲存回呼（只更新特定欄位）
 */
export function renderMaterials(container, currentSettings, saveSettings) {
  // 初始化資料結構
  if (!Array.isArray(currentSettings.materials)) currentSettings.materials = [];
  if (!Array.isArray(currentSettings.material_schema)) currentSettings.material_schema = [];

  const materials = currentSettings.materials;
  const categories = currentSettings.categories || [];

  container.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-800">物料管理</h2>
        <p class="text-sm text-slate-500 mt-1">建立物料主檔，可綁定多個工單類別，並自訂專屬的詳細欄位。</p>
      </div>
      <div class="flex gap-2">
        <button id="btn-manage-mat-schema" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
          自訂物料欄位
        </button>
      </div>
    </div>

    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 flex flex-col gap-3">
      <div class="text-sm font-semibold text-slate-700">新增物料</div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" id="new-mat-name" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="物料名稱 (例如：110G-毛紙)">
        <button id="btn-add-mat" class="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>
      <div class="flex flex-col gap-1.5 mt-2">
        <label class="text-sm font-medium text-slate-700">適用類別 (可多選，留空為通用)</label>
        <div class="flex flex-wrap gap-2">
          ${categories.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何類別</span>' : ''}
          ${categories.map(c => `
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="new-mat-cat-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${c}">
              <span class="text-slate-700">${c}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      ${materials.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無物料資料</div>' : ''}
      ${materials.map((mat, index) => {
        const cats = Array.isArray(mat.categories) ? mat.categories : [];
        return `
          <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <button class="font-bold text-brand hover:underline text-base btn-edit-mat-detail" data-index="${index}">${mat.name}</button>
                ${cats.length > 0 
                  ? cats.map(c => `<span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">${c}</span>`).join('')
                  : `<span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded">通用</span>`
                }
              </div>
              <div class="flex items-center gap-2">
                <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-mat" data-index="${index}">
                  <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-mat" data-index="${index}">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
            <!-- 顯示自訂欄位的摘要 -->
            <div class="flex flex-wrap gap-4 text-sm text-slate-600 mt-1">
              ${(currentSettings.material_schema || []).map(field => {
                const val = mat.data ? mat.data[field.key] : '';
                if (!val) return '';
                return `<div><span class="text-slate-400 text-xs">${field.label}:</span> ${val}</div>`;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  // 1. 新增物料
  document.getElementById('btn-add-mat')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-mat-name');
    const name = nameInput.value.trim();
    if (!name) return;
    if (materials.some(m => m.name === name)) {
      showToast('物料名稱已存在', 'error');
      return;
    }
    
    const selectedCats = Array.from(container.querySelectorAll('.new-mat-cat-cb:checked')).map(cb => cb.value);
    
    const newMat = { 
      id: 'mat_' + Date.now().toString(36), 
      name, 
      categories: selectedCats,
      data: {}
    };
    
    materials.push(newMat);
    await saveSettings({ materials });
    showToast('物料已新增', 'success');
  });

  // 2. 刪除物料
  container.querySelectorAll('.btn-del-mat').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = e.currentTarget.dataset.index;
      const confirmed = await openConfirm({
        title: '刪除物料',
        message: `確定要刪除「${materials[idx].name}」嗎？此操作不影響已存在的工單。`,
        isDanger: true
      });
      if (!confirmed) return;
      materials.splice(idx, 1);
      await saveSettings({ materials });
      showToast('物料已刪除', 'success');
    });
  });

  // 3. 編輯物料基本資料（名稱與類別）
  container.querySelectorAll('.btn-edit-mat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const mat = materials[idx];
      const selectedCats = Array.isArray(mat.categories) ? mat.categories : [];

      const content = `
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">物料名稱</label>
            <input type="text" id="edit-mat-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${mat.name}">
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">適用類別 (可多選)</label>
            <div class="flex flex-wrap gap-2">
              ${categories.map(c => `
                <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                  <input type="checkbox" class="edit-mat-cat-cb w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${c}" ${selectedCats.includes(c) ? 'checked' : ''}>
                  <span class="text-slate-700">${c}</span>
                </label>
              `).join('')}
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

      const { close, element } = openModal({ title: '編輯物料', content, footer });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-mat-name').value.trim();
        if (!newName) {
          showToast('名稱不能為空', 'error');
          return;
        }
        const newCats = Array.from(element.querySelectorAll('.edit-mat-cat-cb:checked')).map(cb => cb.value);

        materials[idx].name = newName;
        materials[idx].categories = newCats;

        await saveSettings({ materials });
        showToast('物料已更新', 'success');
        close();
      });
    });
  });

  // 4. 填寫物料詳細資料 (點擊名稱)
  container.querySelectorAll('.btn-edit-mat-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const mat = materials[idx];
      const matSchema = currentSettings.material_schema || [];
      
      if (matSchema.length === 0) {
        showToast('尚未設定物料自訂欄位，請先點擊右上角「自訂物料欄位」', 'info');
        return;
      }

      const content = `
        <div class="flex flex-col gap-4">
          <p class="text-sm text-slate-500 mb-2">正在編輯：<strong class="text-slate-800">${mat.name}</strong></p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${matSchema.map(f => {
              const val = mat.data ? mat.data[f.key] : '';
              const inputType = f.type === 'number' ? 'number' : 'text';
              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label}</label>
                  <input type="${inputType}" class="mat-detail-input w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" 
                    data-key="${f.key}" value="${val || ''}" placeholder="請輸入${f.label}">
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      const footer = `
        <div class="flex justify-end gap-3">
          <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
          <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存詳細資料</button>
        </div>
      `;

      const { close, element } = openModal({ title: '物料詳細資料', content, footer });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        if (!materials[idx].data) materials[idx].data = {};
        
        element.querySelectorAll('.mat-detail-input').forEach(input => {
          const key = input.dataset.key;
          materials[idx].data[key] = input.value;
        });

        await saveSettings({ materials });
        showToast('詳細資料已儲存', 'success');
        close();
      });
    });
  });

  // 5. 自訂物料欄位管理 (Schema)
  document.getElementById('btn-manage-mat-schema')?.addEventListener('click', () => {
    const matSchema = currentSettings.material_schema || [];

    const content = `
      <div class="flex flex-col gap-4">
        <div class="flex gap-2">
          <input type="text" id="new-schema-label" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="新增欄位名稱 (例如：單價)">
          <select id="new-schema-type" class="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none">
            <option value="string">文字</option>
            <option value="number">數字</option>
          </select>
          <button id="btn-add-schema" class="btn-primary px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">新增</button>
        </div>

        <div class="flex flex-col gap-2 mt-4" id="schema-list">
          ${matSchema.map((f, i) => `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
              <div class="flex flex-col">
                <span class="font-bold text-slate-700">${f.label}</span>
                <span class="text-xs text-slate-400 font-mono">${f.key} (${f.type === 'number' ? '數字' : '文字'})</span>
              </div>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 btn-del-schema" data-key="${f.key}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
          ${matSchema.length === 0 ? '<div class="text-slate-400 text-sm text-center py-4">尚未建立自訂欄位</div>' : ''}
        </div>
      </div>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-close-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">完成</button>
      </div>
    `;

    const { close, element } = openModal({ title: '自訂物料欄位', content, footer });

    element.querySelector('#modal-close-btn').addEventListener('click', close);

    // 新增 Schema
    element.querySelector('#btn-add-schema')?.addEventListener('click', async () => {
      const label = element.querySelector('#new-schema-label').value.trim();
      const type = element.querySelector('#new-schema-type').value;
      if (!label) return;

      const newSchema = Array.isArray(currentSettings.material_schema) ? [...currentSettings.material_schema] : [];
      newSchema.push({ key: 'mat_' + Date.now().toString(36), label, type });
      
      await saveSettings({ material_schema: newSchema });
      close(); // 關閉視窗，重新開啟以刷新列表 (簡單做法)
      showToast('欄位已新增，請重新點擊「自訂物料欄位」', 'success');
    });

    // 刪除 Schema
    element.querySelectorAll('.btn-del-schema').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        const newSchema = (currentSettings.material_schema || []).filter(f => f.key !== key);
        
        await saveSettings({ material_schema: newSchema });
        close();
        showToast('欄位已刪除', 'success');
      });
    });
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-material.js
V: 1793054000
W: UPGRADE-007
*/