import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { createIcons, Plus, Trash2, Edit2, Settings2 } from 'lucide';

/**
 * 渲染外發供應商管理頁面
 * @param {HTMLElement} container 目標容器
 * @param {Object} currentSettings settings/main 的內容
 * @param {Function} saveSettings 儲存回呼（只更新特定欄位）
 */
export function renderSuppliers(container, currentSettings, saveSettings) {
  // 初始化資料結構
  if (!Array.isArray(currentSettings.suppliers)) currentSettings.suppliers = [];
  if (!Array.isArray(currentSettings.supplier_schema)) currentSettings.supplier_schema = [];

  const suppliers = currentSettings.suppliers;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-800">外發供應商管理</h2>
        <p class="text-sm text-slate-500 mt-1">建立外發廠商名單，並可自訂專屬的聯絡資訊或備註欄位。</p>
      </div>
      <div class="flex gap-2">
        <button id="btn-manage-sup-schema" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
          <i data-lucide="settings-2" class="w-4 h-4"></i> 自訂供應商欄位
        </button>
      </div>
    </div>

    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 flex flex-col gap-3">
      <div class="text-sm font-semibold text-slate-700">新增供應商</div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" id="new-sup-name" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="供應商名稱 (例如：大華印刷廠)">
        <button id="btn-add-sup" class="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      ${suppliers.length === 0 ? '<div class="text-slate-400 text-sm py-4 text-center">尚無供應商資料</div>' : ''}
      ${suppliers.map((sup, index) => `
        <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <button class="font-bold text-brand hover:underline text-base btn-edit-sup-detail" data-index="${index}">${sup.name}</button>
            </div>
            <div class="flex items-center gap-2">
              <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-sup" data-index="${index}">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-sup" data-index="${index}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
          <!-- 顯示自訂欄位的摘要 -->
          <div class="flex flex-wrap gap-4 text-sm text-slate-600 mt-1">
            ${(currentSettings.supplier_schema || []).map(field => {
              const val = sup.data ? sup.data[field.key] : '';
              if (!val) return '';
              return `<div><span class="text-slate-400 text-xs">${field.label}:</span> ${val}</div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2, Settings2 }, attrs: { class: 'w-4 h-4' } });

  // 1. 新增供應商
  document.getElementById('btn-add-sup')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-sup-name');
    const name = nameInput.value.trim();
    if (!name) return;
    if (suppliers.some(s => s.name === name)) {
      showToast('供應商名稱已存在', 'error');
      return;
    }
    
    const newSup = { 
      id: 'sup_' + Date.now().toString(36), 
      name, 
      data: {}
    };
    
    suppliers.push(newSup);
    await saveSettings({ suppliers });
    showToast('供應商已新增', 'success');
  });

  // 2. 刪除供應商
  container.querySelectorAll('.btn-del-sup').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = e.currentTarget.dataset.index;
      const confirmed = await openConfirm({
        title: '刪除供應商',
        message: `確定要刪除「${suppliers[idx].name}」嗎？此操作不影響已存在的工單。`,
        isDanger: true
      });
      if (!confirmed) return;
      suppliers.splice(idx, 1);
      await saveSettings({ suppliers });
      showToast('供應商已刪除', 'success');
    });
  });

  // 3. 編輯供應商基本資料（名稱）
  container.querySelectorAll('.btn-edit-sup').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const sup = suppliers[idx];

      const content = `
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-slate-700">供應商名稱</label>
            <input type="text" id="edit-sup-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${sup.name}">
          </div>
        </div>
      `;

      const footer = `
        <div class="flex justify-end gap-3">
          <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
          <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存</button>
        </div>
      `;

      const { close, element } = openModal({ title: '編輯供應商', content, footer });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-sup-name').value.trim();
        if (!newName) {
          showToast('名稱不能為空', 'error');
          return;
        }
        
        suppliers[idx].name = newName;
        await saveSettings({ suppliers });
        showToast('供應商已更新', 'success');
        close();
      });
    });
  });

  // 4. 填寫供應商詳細資料 (點擊名稱)
  container.querySelectorAll('.btn-edit-sup-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const sup = suppliers[idx];
      const supSchema = currentSettings.supplier_schema || [];
      
      if (supSchema.length === 0) {
        showToast('尚未設定供應商自訂欄位，請先點擊右上角「自訂供應商欄位」', 'info');
        return;
      }

      const content = `
        <div class="flex flex-col gap-4">
          <p class="text-sm text-slate-500 mb-2">正在編輯：<strong class="text-slate-800">${sup.name}</strong></p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${supSchema.map(f => {
              const val = sup.data ? sup.data[f.key] : '';
              const inputType = f.type === 'number' ? 'number' : 'text';
              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label}</label>
                  <input type="${inputType}" class="sup-detail-input w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" 
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

      const { close, element } = openModal({ title: '供應商詳細資料', content, footer });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        if (!suppliers[idx].data) suppliers[idx].data = {};
        
        element.querySelectorAll('.sup-detail-input').forEach(input => {
          const key = input.dataset.key;
          suppliers[idx].data[key] = input.value;
        });

        await saveSettings({ suppliers });
        showToast('詳細資料已儲存', 'success');
        close();
      });
    });
  });

  // 5. 自訂供應商欄位管理 (Schema)
  document.getElementById('btn-manage-sup-schema')?.addEventListener('click', () => {
    const supSchema = currentSettings.supplier_schema || [];

    const content = `
      <div class="flex flex-col gap-4">
        <div class="flex gap-2">
          <input type="text" id="new-sup-schema-label" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="新增欄位名稱 (例如：聯絡人)">
          <select id="new-sup-schema-type" class="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none">
            <option value="string">文字</option>
            <option value="number">數字</option>
          </select>
          <button id="btn-add-sup-schema" class="btn-primary px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">新增</button>
        </div>

        <div class="flex flex-col gap-2 mt-4" id="sup-schema-list">
          ${supSchema.map((f, i) => `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
              <div class="flex flex-col">
                <span class="font-bold text-slate-700">${f.label}</span>
                <span class="text-xs text-slate-400 font-mono">${f.key} (${f.type === 'number' ? '數字' : '文字'})</span>
              </div>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 btn-del-sup-schema" data-key="${f.key}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
          ${supSchema.length === 0 ? '<div class="text-slate-400 text-sm text-center py-4">尚未建立自訂欄位</div>' : ''}
        </div>
      </div>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-close-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">完成</button>
      </div>
    `;

    const { close, element } = openModal({ title: '自訂供應商欄位', content, footer });

    element.querySelector('#modal-close-btn').addEventListener('click', close);

    // 新增 Schema
    element.querySelector('#btn-add-sup-schema')?.addEventListener('click', async () => {
      const label = element.querySelector('#new-sup-schema-label').value.trim();
      const type = element.querySelector('#new-sup-schema-type').value;
      if (!label) return;

      const newSchema = Array.isArray(currentSettings.supplier_schema) ? [...currentSettings.supplier_schema] : [];
      newSchema.push({ key: 'sup_' + Date.now().toString(36), label, type });
      
      await saveSettings({ supplier_schema: newSchema });
      close(); // 關閉視窗，重新開啟以刷新列表
      showToast('欄位已新增，請重新點擊「自訂供應商欄位」', 'success');
    });

    // 刪除 Schema
    element.querySelectorAll('.btn-del-sup-schema').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        const newSchema = (currentSettings.supplier_schema || []).filter(f => f.key !== key);
        
        await saveSettings({ supplier_schema: newSchema });
        close();
        showToast('欄位已刪除', 'success');
      });
    });
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-supplier.js
V: 1793064000
W: UPGRADE-007
*/