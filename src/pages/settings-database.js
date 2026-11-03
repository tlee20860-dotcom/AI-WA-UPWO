import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { createIcons, Plus, Trash2, Edit2, Settings2, Database, GripVertical, X, Check } from 'lucide';

let activeDbId = '';

export function renderDatabaseCenter(container, currentSettings, saveSettings) {
  if (!Array.isArray(currentSettings.custom_databases)) {
    currentSettings.custom_databases = [];
  }

  const databases = currentSettings.custom_databases;

  // 如果沒有選中的 DB，自動選第一個
  if (databases.length > 0 && (!activeDbId || !databases.some(db => db.id === activeDbId))) {
    activeDbId = databases[0].id;
  }

  // 💡 統一的儲存與雙向同步邏輯
  const updateAndSave = async (newDbs) => {
    let payload = { custom_databases: newDbs };
    
    // 雙向同步回舊的 sales_mapping
    const salesDb = newDbs.find(db => db.id === 'db_sales');
    if (salesDb) {
      payload.sales_mapping = salesDb.items.map(item => {
        const aliasStr = item.data && item.data.aliases ? item.data.aliases : '';
        return {
          name: item.name,
          aliases: aliasStr.split(',').map(s => s.trim()).filter(Boolean)
        };
      });
    }

    await saveSettings(payload);
    
    // 局部更新畫面，不重新載入整個頁面
    currentSettings.custom_databases = newDbs;
    if (payload.sales_mapping) currentSettings.sales_mapping = payload.sales_mapping;
    
    renderDatabaseCenter(container, currentSettings, saveSettings);
  };

  // 渲染主框架
  container.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-800">資料庫中心</h2>
        <p class="text-sm text-slate-500 mt-1">建立自訂資料庫（如：客戶、機台），並可於工單表單中綁定為下拉選單。</p>
      </div>
      <div>
        <button id="btn-add-database" class="btn-primary px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增資料庫
        </button>
      </div>
    </div>

    <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
      <!-- 左側選單 -->
      <div class="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 p-3 flex flex-row md:flex-col gap-1 flex-shrink-0 overflow-x-auto md:overflow-y-auto">
        ${databases.length === 0 ? '<div class="text-sm text-slate-400 p-4 text-center">尚無資料庫</div>' : ''}
        ${databases.map(db => `
          <button class="db-tab-btn whitespace-nowrap text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3 ${db.id === activeDbId ? 'bg-white text-brand shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-100 border border-transparent'}" data-id="${db.id}">
            <i data-lucide="database" class="w-4 h-4"></i> ${db.name}
          </button>
        `).join('')}
      </div>

      <!-- 右側內容 -->
      <div class="flex-1 p-6 md:p-8 flex flex-col relative" id="db-content"></div>
    </div>
  `;

  createIcons({ icons: { Plus, Database }, attrs: { class: 'w-4 h-4' } });

  // 綁定 Tab 切換
  container.querySelectorAll('.db-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeDbId = e.currentTarget.dataset.id;
      renderDatabaseCenter(container, currentSettings, saveSettings);
    });
  });

  // 綁定新增資料庫
  document.getElementById('btn-add-database')?.addEventListener('click', () => {
    const content = `
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-slate-700">資料庫名稱</label>
          <input type="text" id="new-db-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="例如：客戶資料、供應商資料">
        </div>
      </div>
    `;
    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
        <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">建立</button>
      </div>
    `;

    const { close, element } = openModal({ title: '新增資料庫', content, footer });

    element.querySelector('#modal-cancel-btn').addEventListener('click', close);
    element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
      const name = element.querySelector('#new-db-name').value.trim();
      if (!name) {
        showToast('請輸入名稱', 'error');
        return;
      }

      const newDb = {
        id: 'db_' + Date.now().toString(36),
        name: name,
        fields: [],
        items: []
      };

      const newDbs = [...databases, newDb];
      activeDbId = newDb.id;
      await updateAndSave(newDbs);
      showToast('資料庫已建立', 'success');
      close();
    });
  });

  // 💡 將渲染右側內容的邏輯寫在此處，確保能存取 currentSettings 與 updateAndSave
  const renderActiveDbContent = () => {
    const contentContainer = document.getElementById('db-content');
    if (!contentContainer) return;

    const db = currentSettings.custom_databases.find(d => d.id === activeDbId);
    if (!db) {
      contentContainer.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400">請選擇或建立一個資料庫</div>`;
      return;
    }

    contentContainer.innerHTML = `
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 class="text-lg font-bold text-slate-800">${db.name} <span class="text-xs font-normal text-slate-400 ml-2">共 ${db.items.length} 筆資料</span></h3>
          <p class="text-sm text-slate-500 mt-1">管理此資料庫的欄位與資料項目。</p>
        </div>
        <div class="flex gap-2">
          <button id="btn-manage-db-fields" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="settings-2" class="w-4 h-4"></i> 設定欄位
          </button>
          <button id="btn-del-database" class="bg-rose-50 text-rose-600 border border-rose-100 px-3 py-2 rounded-lg text-sm font-medium hover:bg-rose-100 flex items-center gap-2 shadow-sm">
            <i data-lucide="trash-2" class="w-4 h-4"></i> 刪除資料庫
          </button>
        </div>
      </div>

      <div class="flex gap-2 mb-6">
        <input type="text" id="new-db-item-name" class="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand" placeholder="新增資料名稱 (主標題)">
        <button id="btn-add-db-item" class="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增資料
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div class="flex flex-col gap-2">
          ${db.items.length === 0 ? '<div class="text-slate-400 text-sm text-center py-8">尚無資料</div>' : ''}
          ${db.items.map((item, index) => {
            const summary = (db.fields || []).map(f => {
              const val = item.data ? item.data[f.key] : '';
              if (!val) return '';
              return `<span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded mr-2">${f.label}: ${val}</span>`;
            }).join('');

            return `
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group">
                <div class="flex flex-col gap-1">
                  <span class="font-bold text-slate-800">${item.name}</span>
                  <div class="flex flex-wrap gap-y-1">${summary}</div>
                </div>
                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg btn-edit-db-item" data-index="${index}">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                  </button>
                  <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg btn-del-db-item" data-index="${index}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    createIcons({ icons: { Settings2, Trash2, Plus, Edit2 }, attrs: { class: 'w-4 h-4' } });

    // 刪除資料庫
    contentContainer.querySelector('#btn-del-database')?.addEventListener('click', async () => {
      const confirmed = await openConfirm({
        title: '刪除資料庫',
        message: `確定要刪除「${db.name}」嗎？這將會刪除底下所有資料，且無法復原。`,
        isDanger: true
      });
      if (!confirmed) return;

      const newDbs = currentSettings.custom_databases.filter(d => d.id !== activeDbId);
      activeDbId = newDbs.length > 0 ? newDbs[0].id : '';
      await updateAndSave(newDbs);
      showToast('資料庫已刪除', 'success');
    });

    // 設定欄位
    contentContainer.querySelector('#btn-manage-db-fields')?.addEventListener('click', () => {
      renderDbFieldsModal(db);
    });

    // 新增資料
    contentContainer.querySelector('#btn-add-db-item')?.addEventListener('click', () => {
      const nameInput = contentContainer.querySelector('#new-db-item-name');
      const name = nameInput.value.trim();
      if (!name) return;

      const newItem = { id: 'item_' + Date.now().toString(36), name: name, data: {} };
      const newDbs = JSON.parse(JSON.stringify(currentSettings.custom_databases));
      const targetDb = newDbs.find(d => d.id === activeDbId);
      targetDb.items.push(newItem);
      
      updateAndSave(newDbs).then(() => showToast('資料已新增', 'success'));
    });

    // 編輯資料
    contentContainer.querySelectorAll('.btn-edit-db-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const item = db.items[idx];
        const fields = db.fields || [];

        if (fields.length === 0) {
          showToast('該資料庫尚未設定自訂欄位，請先點擊「設定欄位」', 'info');
          return;
        }

        const content = `
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">資料名稱 (主標題)</label>
              <input type="text" id="edit-item-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${item.name}">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              ${fields.map(f => {
                const val = item.data ? item.data[f.key] : '';
                const inputType = f.type === 'number' ? 'number' : 'text';
                return `
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-slate-700">${f.label}</label>
                    <input type="${inputType}" class="edit-item-data-input w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" 
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
            <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">儲存</button>
          </div>
        `;

        const { close, element } = openModal({ title: `編輯資料 - ${item.name}`, content, footer });

        element.querySelector('#modal-cancel-btn').addEventListener('click', close);
        element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
          const newName = element.querySelector('#edit-item-name').value.trim();
          if (!newName) {
            showToast('名稱不能為空', 'error');
            return;
          }

          const newData = {};
          element.querySelectorAll('.edit-item-data-input').forEach(input => {
            newData[input.dataset.key] = input.value;
          });

          const newDbs = JSON.parse(JSON.stringify(currentSettings.custom_databases));
          const targetItem = newDbs.find(d => d.id === activeDbId).items[idx];
          targetItem.name = newName;
          targetItem.data = newData;

          await updateAndSave(newDbs);
          showToast('資料已更新', 'success');
          close();
        });
      });
    });

    // 刪除資料
    contentContainer.querySelectorAll('.btn-del-db-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const confirmed = await openConfirm({
          title: '刪除資料',
          message: `確定要刪除「${db.items[idx].name}」嗎？`,
          isDanger: true
        });
        if (!confirmed) return;

        const newDbs = JSON.parse(JSON.stringify(currentSettings.custom_databases));
        newDbs.find(d => d.id === activeDbId).items.splice(idx, 1);
        await updateAndSave(newDbs);
        showToast('已刪除', 'success');
      });
    });
  };

  // 設定欄位彈窗
  const renderDbFieldsModal = (db) => {
    const content = `
      <div class="flex flex-col gap-4">
        <div class="flex gap-2">
          <input type="text" id="new-db-field-label" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="新增欄位名稱 (例如：電話)">
          <select id="new-db-field-type" class="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none">
            <option value="string">文字</option>
            <option value="number">數字</option>
          </select>
          <button id="btn-add-db-field" class="btn-primary px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">新增</button>
        </div>

        <div class="flex flex-col gap-2 mt-4" id="db-fields-list">
          ${(db.fields || []).map((f, i) => `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
              <div class="flex flex-col">
                <span class="font-bold text-slate-700">${f.label}</span>
                <span class="text-xs text-slate-400 font-mono">${f.key} (${f.type === 'number' ? '數字' : '文字'})</span>
              </div>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 btn-del-db-field" data-key="${f.key}">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
          ${(db.fields || []).length === 0 ? '<div class="text-slate-400 text-sm text-center py-4">尚未建立自訂欄位</div>' : ''}
        </div>
      </div>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-close-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">完成</button>
      </div>
    `;

    const { close, element } = openModal({ title: `設定欄位 - ${db.name}`, content, footer });

    element.querySelector('#modal-close-btn').addEventListener('click', close);

    element.querySelector('#btn-add-db-field')?.addEventListener('click', async () => {
      const label = element.querySelector('#new-db-field-label').value.trim();
      const type = element.querySelector('#new-db-field-type').value;
      if (!label) return;

      const newDbs = JSON.parse(JSON.stringify(currentSettings.custom_databases));
      const targetDb = newDbs.find(d => d.id === db.id);
      if (!targetDb.fields) targetDb.fields = [];
      targetDb.fields.push({ key: 'field_' + Date.now().toString(36), label, type });
      
      await updateAndSave(newDbs);
      close();
      showToast('欄位已新增，請重新點擊「設定欄位」', 'success');
    });

    element.querySelectorAll('.btn-del-db-field').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        
        const newDbs = JSON.parse(JSON.stringify(currentSettings.custom_databases));
        const targetDb = newDbs.find(d => d.id === db.id);
        targetDb.fields = targetDb.fields.filter(f => f.key !== key);
        
        await updateAndSave(newDbs);
        close();
        showToast('欄位已刪除', 'success');
      });
    });
  };

  // 執行渲染
  renderActiveDbContent();
}

/*
F: AI-WA-UPWO/src/pages/settings-database.js
V: 1793091000
W: UPGRADE-007
*/