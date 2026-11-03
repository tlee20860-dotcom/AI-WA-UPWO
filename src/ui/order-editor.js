import { createIcons, Save, RotateCcw } from 'lucide';
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
  customDatabases = [], // 💡 接收自訂資料庫
  layoutMode = 'B', 
  initialData = null, 
  isViewMode = false,
  onSave,
  onCancel
}) {
  if (!container) return;

  let displayFields = [];
  if (viewConfig && viewConfig.length > 0) {
    displayFields = viewConfig.map(key => schema.find(f => f.key === key)).filter(Boolean);
  } else {
    displayFields = schema.filter(f => f.isEditable);
  }

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
            const disabledAttr = isViewMode ? 'disabled' : '';
            const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

            // 1. 處理製程路線圖 (route)
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

            // 2. 💡 處理關聯資料庫 (relation)
            if (f.type === 'relation') {
              const targetDb = customDatabases.find(db => db.id === f.db_id);
              const items = targetDb ? targetDb.items : [];
              
              // 處理舊資料可能是存 name 而不是 id 的情況
              const isIdMatch = items.some(item => item.id === value);
              const selectedItem = items.find(item => item.id === value || item.name === value);
              const selectedValue = selectedItem ? selectedItem.id : value;

              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label} <span class="text-xs text-brand">🔗</span></label>
                  <select data-key="${f.key}" class="${baseClass}" ${disabledAttr}>
                    <option value="">(請選擇)</option>
                    ${!targetDb ? '<option value="">找不到關聯資料庫</option>' : ''}
                    ${items.map(item => `<option value="${item.id}" ${item.id === selectedValue ? 'selected' : ''}>${item.name}</option>`).join('')}
                  </select>
                </div>
              `;
            }

            // 3. 一般欄位渲染
            const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
            return `
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-slate-700">${f.label}</label>
                <input type="${inputType}" data-key="${f.key}" value="${value}" class="${baseClass}" placeholder="請輸入${f.label}" ${disabledAttr}>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  createIcons({ icons: { Save, RotateCcw }, attrs: { class: 'w-4 h-4' } });

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
        
        let val = formData[f.key];
        
        // 如果是關聯欄位，我們儲存 ID。但為了讓匯出顯示名稱，我們可以額外存一個 map 或是保留原本的字串？
        // 為了架構單純，這裡依然存 ID。若要顯示名稱，由 UI 讀取 customDatabases 轉換。
        // 但為了向下相容舊的 supplierName (存 name)，這裡不強制轉換，直接存 val。
        
        if (f.isSystem) {
          finalData[f.key] = val;
        } else {
          finalData.data[f.key] = val;
        }
      });

      await onSave(finalData);
    }
  });
}

/*
F: AI-WA-UPWO/src/ui/order-editor.js
V: 1793084000
W: UPGRADE-007
*/