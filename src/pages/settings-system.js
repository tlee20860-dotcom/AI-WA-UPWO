import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { getCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { createIcons, Plus, Trash2, Edit2, AlertCircle } from 'lucide';

/**
 * 渲染帳號管理頁面
 */
export function renderSystemUsers(container, currentSettings, saveSettings, allSalesReps = []) {
  const users = currentSettings.users || [];
  const areas = currentSettings.areas || [];

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">帳號管理</h2>
        <p class="text-sm text-slate-500 mt-1">設定登入系統的帳號、角色與可見範圍。</p>
      </div>
    </div>

    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 flex flex-col gap-3">
      <div class="text-sm font-semibold text-slate-700">新增帳號</div>
      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" id="new-user-name" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="帳號">
        <input type="text" id="new-user-pass" class="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none" placeholder="密碼">
        <select id="new-user-role" class="w-full sm:w-40 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none font-medium">
          <option value="admin">管理員</option>
          <option value="worker">生產員</option>
          <option value="sales">銷售員</option>
          <option value="viewer">一般使用者</option>
        </select>
      </div>
      
      <div id="new-user-areas-wrapper" class="hidden flex-col gap-1.5">
        <label class="text-sm font-medium text-slate-600">可見區域（不勾選 = 全部區域）</label>
        <div class="flex flex-wrap gap-2">
          ${areas.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何區域</span>' : ''}
          ${areas.map(a => `
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="new-user-area-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${a.id}">
              <span class="text-slate-700">${a.name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div id="new-user-sales-wrapper" class="hidden flex-col gap-1.5">
        <label class="text-sm font-medium text-slate-600">可見銷售員（不勾選 = 全部銷售員）</label>
        <div class="flex flex-wrap gap-2">
          ${allSalesReps.length === 0 ? '<span class="text-xs text-slate-400">目前無銷售員資料</span>' : ''}
          ${allSalesReps.map(s => `
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
              <input type="checkbox" class="new-user-sales-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${s}">
              <span class="text-slate-700">${s}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="flex justify-end mt-2">
        <button id="btn-add-user" class="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> 新增帳號
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      ${users.map((u, index) => {
        const uAreas = Array.isArray(u.allowedAreas) ? u.allowedAreas : [];
        const uSales = Array.isArray(u.allowedSales) ? u.allowedSales : [];
        
        const areaLabels = uAreas.map(id => {
          const a = areas.find(x => x.id === id);
          return a ? a.name : id;
        });

        let roleText = '一般使用者';
        let roleColor = 'bg-slate-100 text-slate-600';
        if (u.role === 'admin') { roleText = '管理員'; roleColor = 'bg-brand/10 text-brand'; }
        if (u.role === 'worker') { roleText = '生產員'; roleColor = 'bg-orange-100 text-orange-600'; }
        if (u.role === 'sales') { roleText = '銷售員'; roleColor = 'bg-emerald-100 text-emerald-600'; }

        return `
          <div class="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <div class="w-full md:w-1/4 font-bold text-slate-800">${u.username}</div>
            <div class="w-full md:w-1/4 text-slate-500 font-mono text-sm">••••••••</div>
            <div class="w-full md:w-1/6">
              <span class="px-2 py-1 text-xs font-medium rounded-md ${roleColor}">${roleText}</span>
            </div>
            <div class="flex-1 flex flex-wrap gap-1">
              ${u.role === 'admin' || u.role === 'viewer'
                ? '<span class="text-xs text-slate-400">不受限制</span>'
                : (u.role === 'worker' 
                    ? (uAreas.length === 0 ? '<span class="text-xs text-slate-400">全區可見</span>' : areaLabels.map(l => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${l}</span>`).join(''))
                    : (uSales.length === 0 ? '<span class="text-xs text-slate-400">全銷售員可見</span>' : uSales.map(s => `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">${s}</span>`).join(''))
                  )
              }
            </div>
            <div class="flex items-center gap-1 justify-end">
              <button class="p-1.5 text-slate-400 hover:text-brand hover:bg-slate-50 rounded-lg transition-colors btn-edit-user" data-index="${index}">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors btn-del-user" data-index="${index}" ${u.username === 'admin' ? 'disabled title="無法刪除預設 admin"' : ''}>
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  createIcons({ icons: { Plus, Trash2, Edit2 }, attrs: { class: 'w-4 h-4' } });

  // 新增角色連動顯示
  document.getElementById('new-user-role')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const areasWrap = document.getElementById('new-user-areas-wrapper');
    const salesWrap = document.getElementById('new-user-sales-wrapper');
    
    if (val === 'worker') {
      areasWrap.classList.remove('hidden'); areasWrap.classList.add('flex');
      salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
    } else if (val === 'sales') {
      salesWrap.classList.remove('hidden'); salesWrap.classList.add('flex');
      areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
    } else {
      areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
      salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
    }
  });

  // 新增使用者
  document.getElementById('btn-add-user')?.addEventListener('click', async () => {
    const name = document.getElementById('new-user-name').value.trim();
    const pass = document.getElementById('new-user-pass').value.trim();
    const role = document.getElementById('new-user-role').value;

    if (!name || !pass) {
      showToast('請填寫帳號與密碼', 'error');
      return;
    }
    if (users.some(u => u.username === name)) {
      showToast('帳號已存在', 'error');
      return;
    }

    let allowedAreas = [];
    let allowedSales = [];
    
    if (role === 'worker') {
      allowedAreas = Array.from(document.querySelectorAll('.new-user-area-checkbox:checked')).map(cb => cb.value);
    } else if (role === 'sales') {
      allowedSales = Array.from(document.querySelectorAll('.new-user-sales-checkbox:checked')).map(cb => cb.value);
    }

    users.push({ username: name, password: pass, role, allowedAreas, allowedSales });
    await saveSettings({ users });
    showToast('新增成功', 'success');
  });

  // 刪除使用者
  container.querySelectorAll('.btn-del-user').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (e.currentTarget.disabled) return;
      const idx = e.currentTarget.dataset.index;
      users.splice(idx, 1);
      await saveSettings({ users });
      showToast('刪除成功', 'success');
    });
  });

  // 編輯使用者
  container.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const user = users[idx];
      const userAreas = Array.isArray(user.allowedAreas) ? user.allowedAreas : [];
      const userSales = Array.isArray(user.allowedSales) ? user.allowedSales : [];

      const content = `
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-slate-700">帳號</label>
            <input type="text" id="edit-user-name" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" value="${user.username}" ${user.username === 'admin' ? 'disabled' : ''}>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-slate-700">密碼</label>
            <input type="text" id="edit-user-pass" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none" value="${user.password}">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-slate-700">角色</label>
            <select id="edit-user-role" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none font-medium" ${user.username === 'admin' ? 'disabled' : ''}>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理員</option>
              <option value="worker" ${user.role === 'worker' ? 'selected' : ''}>生產員</option>
              <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>銷售員</option>
              <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>一般使用者</option>
            </select>
          </div>
          
          <div id="edit-user-areas-wrapper" class="flex-col gap-1.5 ${user.role === 'worker' ? 'flex' : 'hidden'}">
            <label class="text-sm font-medium text-slate-700">可見區域（不勾選 = 全部區域）</label>
            <div class="flex flex-wrap gap-2">
              ${areas.length === 0 ? '<span class="text-xs text-slate-400">尚未建立任何區域</span>' : ''}
              ${areas.map(a => `
                <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                  <input type="checkbox" class="edit-user-area-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${a.id}" ${userAreas.includes(a.id) ? 'checked' : ''}>
                  <span class="text-slate-700">${a.name}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div id="edit-user-sales-wrapper" class="flex-col gap-1.5 ${user.role === 'sales' ? 'flex' : 'hidden'}">
            <label class="text-sm font-medium text-slate-700">可見銷售員（不勾選 = 全部銷售員）</label>
            <div class="flex flex-wrap gap-2">
              ${allSalesReps.length === 0 ? '<span class="text-xs text-slate-400">目前無銷售員資料</span>' : ''}
              ${allSalesReps.map(s => `
                <label class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm cursor-pointer hover:border-brand">
                  <input type="checkbox" class="edit-user-sales-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${s}" ${userSales.includes(s) ? 'checked' : ''}>
                  <span class="text-slate-700">${s}</span>
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

      const { close, element } = openModal({ title: '編輯帳號', content, footer });

      element.querySelector('#edit-user-role')?.addEventListener('change', (ev) => {
        const val = ev.target.value;
        const areasWrap = element.querySelector('#edit-user-areas-wrapper');
        const salesWrap = element.querySelector('#edit-user-sales-wrapper');
        
        if (val === 'worker') {
          areasWrap.classList.remove('hidden'); areasWrap.classList.add('flex');
          salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
        } else if (val === 'sales') {
          salesWrap.classList.remove('hidden'); salesWrap.classList.add('flex');
          areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
        } else {
          areasWrap.classList.add('hidden'); areasWrap.classList.remove('flex');
          salesWrap.classList.add('hidden'); salesWrap.classList.remove('flex');
        }
      });

      element.querySelector('#modal-cancel-btn').addEventListener('click', close);

      element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
        const newName = element.querySelector('#edit-user-name').value.trim();
        const newPass = element.querySelector('#edit-user-pass').value.trim();
        const newRole = element.querySelector('#edit-user-role').value;

        if (!newName || !newPass) {
          showToast('帳號與密碼不能為空', 'error');
          return;
        }
        if (newName !== user.username && users.some(u => u.username === newName)) {
          showToast('帳號已存在', 'error');
          return;
        }

        let newAllowedAreas = [];
        let newAllowedSales = [];
        
        if (newRole === 'worker') {
          newAllowedAreas = Array.from(element.querySelectorAll('.edit-user-area-checkbox:checked')).map(cb => cb.value);
        } else if (newRole === 'sales') {
          newAllowedSales = Array.from(element.querySelectorAll('.edit-user-sales-checkbox:checked')).map(cb => cb.value);
        }

        users[idx] = {
          username: newName,
          password: newPass,
          role: newRole,
          allowedAreas: newAllowedAreas,
          allowedSales: newAllowedSales
        };

        await saveSettings({ users });
        showToast('已更新帳號', 'success');
        close();
      });
    });
  });
}

/**
 * 渲染資料管理頁面
 */
export function renderSystemData(container, currentSettings, saveSettings) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">資料管理</h2>
        <p class="text-sm text-slate-500 mt-1">清除由 Excel 匯入的資料，保留您手動輸入的狀態與交期。</p>
      </div>
    </div>

    <div class="bg-rose-50 border border-rose-200 rounded-2xl p-6">
      <h3 class="text-rose-700 font-bold mb-2 flex items-center gap-2">
        <i data-lucide="alert-circle" class="w-5 h-5"></i> 危險操作區
      </h3>
      <p class="text-sm text-rose-600 mb-4">
        點擊下方按鈕將會清空所有工單中「由 Excel 匯入」的資料。清空後，您可以重新匯入新的 Excel，系統會自動合併狀態。
      </p>
      <button id="btn-clear-excel-data" class="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
        <i data-lucide="trash-2" class="w-4 h-4"></i> 清空 Excel 匯入資料
      </button>
    </div>
  `;

  createIcons({ icons: { Trash2, AlertCircle }, attrs: { class: 'w-4 h-4' } });

  document.getElementById('btn-clear-excel-data')?.addEventListener('click', async () => {
    const confirmed = await openConfirm({
      title: '清空 Excel 資料',
      message: '確定要清空嗎？此操作無法復原，但您手動填寫的狀態與交期會保留。',
      isDanger: true,
      confirmText: '確認清空'
    });
    if (!confirmed) return;

    showToast('正在清空資料...', 'info');
    try {
      const orders = await getCollection('work_orders');
      let count = 0;
      for (const order of orders) {
        await updateDocument('work_orders', order.id, {
          salesReps: ["未填寫"],
          uploadDate: "",
          data: { category: order.data?.category || '' }
        });
        count++;
      }
      showToast(`成功清空 ${count} 筆工單的 Excel 資料`, 'success');
    } catch (error) {
      showToast('清空失敗，請稍後再試', 'error');
    }
  });
}

/*
F: AI-WA-UPWO/src/pages/settings-system.js
V: 1793055000
W: UPGRADE-007
*/