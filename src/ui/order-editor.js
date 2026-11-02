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

/**
 * 渲染工單錄入/編輯表單
 * @param {Object} options
 */
export function renderOrderEditor({ 
  container, 
  schema, 
  formulas, 
  viewConfig, 
  routeTemplates = [],
  layoutMode = 'B', 
  initialData = null, 
  isViewMode = false,
  onSave,
  onCancel
}) {
  if (!container) return;

  // 1. 決定要顯示的欄位
  let displayFields = [];
  if (viewConfig && viewConfig.length > 0) {
    displayFields = viewConfig.map(key => schema.find(f => f.key === key)).filter(Boolean);
  } else {
    displayFields = schema.filter(f => f.isEditable);
  }

  // 2. 準備表單初始資料
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

  // 3. 繪製 HTML
  let html = `
    <div class="bg-transparent flex flex-col">
      <!-- Header (固定) -->
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

      <!-- Body (不設滾動，由 Modal 提供) -->
      <div class="py-4 relative" id="editor-body">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          ${displayFields.map(f => {
            const value = formData[f.key] !== undefined ? formData[f.key] : '';
            
            // 特殊處理：生產流程 (route) 渲染為下拉選單
            if (f.key === 'route') {
              let currentMatchName = '';
              if (initialData && initialData.route) {
                // 💡 修正：先正規化再比對
                const currentRouteArr = normalizeRoute(initialData.route);
                const matched = routeTemplates.find(t => JSON.stringify(t.steps) === JSON.stringify(currentRouteArr));
                if (matched) currentMatchName = matched.name;
              }

              const disabledAttr = isViewMode ? 'disabled' : '';
              const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

              return `
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700">${f.label}</label>
                  <select data-key="${f.key}" class="${baseClass}" ${disabledAttr}>
                    <option value="">(自訂流程 / 預設)</option>
                    ${routeTemplates.map(t => `<option value="${t.name}" ${t.name === currentMatchName ? 'selected' : ''}>${t.name}</option>`).join('')}
                  </select>
                </div>
              `;
            }

            // 一般欄位渲染
            const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
            const disabledAttr = isViewMode ? 'disabled' : '';
            const baseClass = `w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

            return `
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-slate-700">${f.label}</label>
                <input 
                  type="${inputType}" 
                  data-key="${f.key}" 
                  value="${value}" 
                  class="${baseClass}" 
                  placeholder="請輸入${f.label}"
                  ${disabledAttr}
                >
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  createIcons({ icons: { Save, RotateCcw }, attrs: { class: 'w-4 h-4' } });

  // 4. 綁定事件
  const bodyEl = container.querySelector('#editor-body');
  const inputs = bodyEl.querySelectorAll('input, select, textarea');
  
  // 4.1 即時計算與連動
  const handleInputChange = (e) => {
    const target = e.target;
    const key = target.dataset.key;
    if (!key) return;

    // 處理生產流程變更
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
          showToast(`已套用流程：${templateName}`, 'info');
        }
      }
      return;
    }

    formData[key] = target.value;

    // 如果有設定公式，執行計算
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

  // 4.2 取消按鈕
  container.querySelector('#editor-btn-cancel')?.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  // 4.3 儲存按鈕
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
V: 1793035000
W: UPGRADE-007
*/