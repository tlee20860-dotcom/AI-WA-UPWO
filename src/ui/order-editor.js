import { createIcons, Save, RotateCcw, Plus, Trash2 } from 'lucide';
import { showToast } from './toast.js';
import { evaluate } from '../domain/formula-engine.js';

/**
 * 輔助函式：將可能是字串或陣列的 route 統一轉為陣列
 */
function normalizeRoute(route) {
  if (Array.isArray(route)) return route;
  if (typeof route === 'string') {
    if (route.includes(',')) return route.split(',').map(s => s.trim()).filter(Boolean);
    if (route.includes('→')) return route.split('→').map(s => s.trim()).filter(Boolean);
    return [route.trim()];
  }
  return [];
}

export function renderOrderEditor({ 
  container, 
  schema, 
  formulas, 
  viewConfig, 
  routeTemplates = [],
  materials = [], 
  suppliers = [], 
  layoutMode = 'B', 
  initialData = null, 
  isViewMode = false,
  onSave,
  onCancel,
  onQuickAddMaterial // 💡 新增：快速新增物料的回呼函式
}) {
  if (!container) return;

  let displayFields = [];
  if (viewConfig && viewConfig.length > 0) {
    displayFields = viewConfig.map(key => schema.find(f => f.key === key)).filter(Boolean);
  } else {
    displayFields = schema.filter(f => f.isEditable);
  }

  displayFields = displayFields.map(f => {
    if (f.key === 'route') {
      return Object.assign({}, f, { label: '製程路線圖' });
    }
    if (f.key === 'supplierName') {
      return Object.assign({}, f, { label: '外發供應商' });
    }
    return f;
  });

  const formData = {};
  displayFields.forEach(f => {
    if (initialData) {
      if (initialData.data && initialData.data[f.key] !== undefined) {
        formData[f.key] = initialData.data[f.key];
      } else if (initialData[f.key] !== undefined) {
        formData[f.key] = initialData[f.key];
      } else {
        formData[f.key] = '';
      }
    } else {
      formData[f.key] = '';
    }
  });

  let currentMaterials = Array.isArray(initialData?.materials) ? JSON.parse(JSON.stringify(initialData.materials)) : [];
  
  const getOrderCategory = () => {
    return (initialData && initialData.data && initialData.data.category) 
      ? String(initialData.data.category).toUpperCase() 
      : (formData['id'] ? String(formData['id']).match(/^[a-zA-Z]+/)?.[0]?.toUpperCase() : '其他') || '其他';
  };

  let html = `
    <div class="bg-transparent flex flex-col">
      <div class="px-2 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between flex-shrink-0 gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-slate-800">${initialData ? '編輯工單資料' : '新增工單資料'}</h2>
          <span class="text-xs px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded">${isViewMode ? '檢視模式' : '編輯模式'}</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="editor-btn-cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button id="editor-btn-save" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 transition-all flex items-center gap-2 ${isViewMode ? 'hidden' : ''}">
            <i data-lucide="save" class="w-4 h-4"></i> 儲存
          </button>
        </div>
      </div>

      <div class="py-4 relative" id="editor-body">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          ${displayFields.map(f => {
            const value = formData[f.key] !== undefined ? formData[f.key] : '';
            
            if (f.key === 'supplierName') {
              const isKnown = suppliers.some(s => s.name === value);
              const customOption = (value && !isKnown) ? `<option value="${value}" selected>${value} (自訂)</option>` : '';
              const disabledAttr = isViewMode ? 'disabled' : '';
              const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label}</label>
                  <select data-key="${f.key}" class="${baseClass}" ${disabledAttr}>
                    <option value="">(無 / 自行生產)</option>
                    ${customOption}
                    ${suppliers.map(s => `<option value="${s.name}" ${s.name === value ? 'selected' : ''}>${s.name}</option>`).join('')}
                  </select>
                </div>
              `;
            }

            if (f.key === 'route') {
              const orderCategory = getOrderCategory();
              const availableTemplates = routeTemplates.filter(t => {
                if (!t.categories || t.categories.length === 0) return true;
                if (Array.isArray(t.categories)) return t.categories.map(c => String(c).toUpperCase()).includes(orderCategory);
                if (typeof t.category === 'string' && t.category.trim() !== '') return t.category.toUpperCase() === orderCategory;
                return false;
              });

              let currentMatchName = '';
              if (initialData && initialData.route) {
                const currentRouteArr = normalizeRoute(initialData.route);
                const matched = availableTemplates.find(t => JSON.stringify(t.steps) === JSON.stringify(currentRouteArr));
                if (matched) currentMatchName = matched.name;
              }

              const disabledAttr = isViewMode ? 'disabled' : '';
              const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label}</label>
                  <select data-key="${f.key}" class="${baseClass}" ${disabledAttr}>
                    <option value="" ${currentMatchName === '' ? 'selected' : ''}>(自訂流程 / 預設)</option>
                    ${availableTemplates.map(t => `<option value="${t.name}" ${t.name === currentMatchName ? 'selected' : ''}>${t.name}</option>`).join('')}
                  </select>
                </div>
              `;
            }

            const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
            const disabledAttr = isViewMode ? 'disabled' : '';
            const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

            return `
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-slate-700">${f.label}</label>
                <input type="${inputType}" data-key="${f.key}" value="${value}" class="${baseClass}" placeholder="請輸入${f.label}" ${disabledAttr}>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 💡 工單物料明細區塊 -->
        <div class="mt-8 border-t border-slate-200 pt-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h3 class="text-base font-bold text-slate-800">工單物料明細</h3>
            
            ${!isViewMode ? `
            <div class="flex items-center gap-2">
              <input type="text" id="quick-add-mat-input" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand w-48" placeholder="快速新增物料名稱...">
              <button id="btn-quick-add-mat" class="bg-white text-brand border border-brand/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand/5 flex items-center gap-1 transition-colors">
                <i data-lucide="plus" class="w-4 h-4"></i> 新增
              </button>
              <button id="btn-add-material" class="text-sm text-brand hover:text-brand-hover font-medium flex items-center gap-1 ml-2">
                新增明細列
              </button>
            </div>
            ` : ''}
          </div>
          
          <div class="overflow-x-auto w-full">
            <table class="w-full text-left border-collapse min-w-[500px]" id="material-table">
              <thead>
                <tr class="border-b border-slate-200 text-sm text-slate-500">
                  <th class="pb-2 font-medium">物料名稱</th>
                  <th class="pb-2 font-medium w-24">數量</th>
                  <th class="pb-2 font-medium">備註</th>
                  ${!isViewMode ? `<th class="pb-2 w-12"></th>` : ''}
                </tr>
              </thead>
              <tbody id="material-tbody"></tbody>
            </table>
            <div id="material-empty" class="text-center text-slate-400 text-sm py-4 hidden">尚未新增任何物料</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  createIcons({ icons: { Save, RotateCcw, Plus, Trash2 }, attrs: { class: 'w-4 h-4' } });

  const tbody = container.querySelector('#material-tbody');
  const emptyMsg = container.querySelector('#material-empty');

  const renderMaterialsTable = () => {
    if (currentMaterials.length === 0) {
      tbody.innerHTML = '';
      emptyMsg.classList.remove('hidden');
      return;
    }
    emptyMsg.classList.add('hidden');

    const orderCategory = getOrderCategory();

    tbody.innerHTML = currentMaterials.map((mat, idx) => {
      const availableMaterials = materials.filter(m => {
        if (!m.categories || m.categories.length === 0) return true;
        return m.categories.map(c => String(c).toUpperCase()).includes(orderCategory);
      });

      const isKnown = availableMaterials.some(m => m.id === mat.materialId);
      const customMatOption = (!isKnown && mat.materialId) ? `<option value="${mat.materialId}" selected>${mat.name || '未知物料'} (自訂)</option>` : '';

      return `
        <tr class="border-b border-slate-100 last:border-0" data-index="${idx}">
          <td class="py-2 pr-2">
            <select class="mat-name-select w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" ${isViewMode ? 'disabled' : ''}>
              <option value="">請選擇物料</option>
              ${customMatOption}
              ${availableMaterials.map(m => `<option value="${m.id}" ${mat.materialId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
            </select>
          </td>
          <td class="py-2 pr-2">
            <input type="number" class="mat-qty-input w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${mat.qty || ''}" placeholder="0" ${isViewMode ? 'disabled' : ''}>
          </td>
          <td class="py-2 pr-2">
            <input type="text" class="mat-note-input w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${mat.note || ''}" placeholder="選填" ${isViewMode ? 'disabled' : ''}>
          </td>
          ${!isViewMode ? `
          <td class="py-2 text-center">
            <button class="btn-del-mat text-slate-400 hover:text-rose-500 p-1" data-index="${idx}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    createIcons({ icons: { Trash2 }, attrs: { class: 'w-4 h-4' } });

    tbody.querySelectorAll('.mat-name-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        currentMaterials[idx].materialId = e.target.value;
      });
    });

    tbody.querySelectorAll('.mat-qty-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        currentMaterials[idx].qty = e.target.value;
      });
    });

    tbody.querySelectorAll('.mat-note-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        currentMaterials[idx].note = e.target.value;
      });
    });

    tbody.querySelectorAll('.btn-del-mat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index);
        currentMaterials.splice(idx, 1);
        renderMaterialsTable();
      });
    });
  };

  renderMaterialsTable();

  // 💡 快速新增物料事件
  container.querySelector('#btn-quick-add-mat')?.addEventListener('click', async () => {
    const input = container.querySelector('#quick-add-mat-input');
    const name = input.value.trim();
    if (!name) return;
    
    if (materials.some(m => m.name === name)) {
      showToast('該物料已存在，請直接從下拉選單選擇', 'error');
      return;
    }

    if (onQuickAddMaterial) {
      const btn = container.querySelector('#btn-quick-add-mat');
      btn.innerHTML = '新增中...';
      btn.disabled = true;
      
      try {
        // 呼叫外部寫入資料庫，並回傳新物件
        const newMat = await onQuickAddMaterial(name);
        if (newMat) {
          materials.push(newMat); // 更新本地陣列
          // 自動加入明細列
          currentMaterials.push({ materialId: newMat.id, qty: '', note: '' });
          renderMaterialsTable();
          input.value = '';
          showToast(`已新增物料：${name}`, 'success');
        }
      } catch (err) {
        showToast('新增物料失敗', 'error');
      } finally {
        btn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> 新增`;
        btn.disabled = false;
        createIcons({ icons: { Plus }, attrs: { class: 'w-4 h-4' } });
      }
    }
  });

  // 新增空白明細列
  container.querySelector('#btn-add-material')?.addEventListener('click', () => {
    currentMaterials.push({ materialId: '', qty: '', note: '' });
    renderMaterialsTable();
  });

  const bodyEl = container.querySelector('#editor-body');
  const inputs = bodyEl.querySelectorAll('input[data-key], select[data-key]');
  
  const handleInputChange = (e) => {
    const target = e.target;
    const key = target.dataset.key;
    if (!key) return;

    if (key === 'route') {
      const templateName = target.value;
      if (templateName) {
        const matchedTemplate = routeTemplates.find(t => t.name === templateName);
        if (matchedTemplate && matchedTemplate.steps) {
          formData['status'] = matchedTemplate.steps[0];
          const statusInput = bodyEl.querySelector(`[data-key="status"]`);
          if (statusInput) {
            statusInput.value = formData['status'];
            statusInput.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
            setTimeout(() => statusInput.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200'), 600);
          }
          showToast(`已套用路線圖：${templateName}`, 'info');
        }
      }
      return;
    }

    formData[key] = target.value;

    if (formulas && Object.keys(formulas).length > 0) {
      const results = evaluate(formulas, formData);
      Object.entries(results).forEach(([resKey, resVal]) => {
        const resInput = bodyEl.querySelector(`[data-key="${resKey}"]`);
        if (resInput && resInput.value !== resVal) {
          resInput.value = resVal;
          formData[resKey] = resVal;
          resInput.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
          setTimeout(() => resInput.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200'), 600);
        }
      });
    }
  };

  inputs.forEach(input => {
    input.addEventListener('input', handleInputChange);
    input.addEventListener('change', handleInputChange);
  });

  container.querySelector('#editor-btn-cancel')?.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  container.querySelector('#editor-btn-save')?.addEventListener('click', async () => {
    if (onSave) {
      const finalData = Object.assign({}, initialData); 
      if (!finalData.data) finalData.data = {};
      if (!finalData.id) finalData.id = formData['id'];

      const selectedTemplateName = bodyEl.querySelector('[data-key="route"]')?.value;
      if (selectedTemplateName) {
        const matchedTemplate = routeTemplates.find(t => t.name === selectedTemplateName);
        if (matchedTemplate) {
          finalData.route = matchedTemplate.steps;
        }
      } else {
        if (!finalData.route) finalData.route = []; 
      }
      
      if (formData['status']) finalData.status = formData['status'];

      displayFields.forEach(f => {
        if (f.key === 'route' || f.key === 'status') return;
        const val = formData[f.key];
        if (f.key === 'supplierName') {
           finalData.supplierName = val;
        } else if (f.isSystem) {
          finalData[f.key] = val;
        } else {
          finalData.data[f.key] = val;
        }
      });

      finalData.materials = currentMaterials.map(m => {
        const matchedMat = materials.find(x => x.id === m.materialId);
        return {
          materialId: m.materialId,
          name: matchedMat ? matchedMat.name : '未知物料',
          qty: m.qty,
          note: m.note
        };
      }).filter(m => m.materialId !== '');

      await onSave(finalData);
    }
  });
}

/*
F: AI-WA-UPWO/src/ui/order-editor.js
V: 1793078000
W: UPGRADE-007
*/