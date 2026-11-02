import { createIcons, Save, RotateCcw, Search, Plus, Layers, List, Columns } from 'lucide';
import { showToast } from './toast.js';
import { evaluate } from '../domain/formula-engine.js';

/**
 * 渲染工單錄入/編輯表單
 * @param {Object} options
 * @param {HTMLElement} options.container 目標容器
 * @param {Object} options.schema 系統欄位設定
 * @param {Object} options.formulas 公式設定
 * @param {Object} options.viewConfig 視圖配置 (決定要顯示的欄位與順序)
 * @param {string} options.layoutMode 佈局模式 'A' (一頁到底) | 'B' (分頁) | 'C' (左右對照)
 * @param {Object} options.initialData 初始資料 (若為編輯模式，帶入現有資料；若為新增，為 null)
 * @param {boolean} options.isViewMode 是否為檢視模式 (唯讀)
 * @param {Function} options.onSave 儲存回呼 async (data) => {}
 * @param {Function} options.onCancel 取消回呼
 */
export function renderOrderEditor({ 
  container, 
  schema, 
  formulas, 
  viewConfig, 
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
    // Fallback: 若無配置，顯示所有 isEditable 欄位
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

  // 3. 繪製 HTML (移除強制分類的 Tabs，直接平鋪以保證顯示所有欄位)
  let html = `
    <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col h-full">
      <!-- Header (固定) -->
      <div class="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 flex-shrink-0 gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-slate-800">${initialData ? '編輯工單' : '新增工單'}</h2>
          <span class="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">${isViewMode ? '檢視模式' : '編輯模式'}</span>
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

      <!-- Body (滾動) -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30 min-h-0 relative" id="editor-body">
        <div class="max-w-5xl mx-auto">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            ${displayFields.map(f => {
              const value = formData[f.key] !== undefined ? formData[f.key] : '';
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
    </div>
  `;

  container.innerHTML = html;
  createIcons({ icons: { Save, RotateCcw }, attrs: { class: 'w-4 h-4' } });

  // 4. 綁定事件
  const bodyEl = container.querySelector('#editor-body');
  const inputs = bodyEl.querySelectorAll('input, select, textarea');
  
  // 4.1 即時計算 (當輸入值改變時)
  const handleInputChange = (e) => {
    const target = e.target;
    const key = target.dataset.key;
    if (!key) return;

    formData[key] = target.value;

    // 如果有設定公式，執行計算
    if (formulas && Object.keys(formulas).length > 0) {
      const results = evaluate(formulas, formData);
      
      // 將計算結果寫回表單（如果該欄位有在畫面上）
      Object.entries(results).forEach(([resKey, resVal]) => {
        const resInput = bodyEl.querySelector(`[data-key="${resKey}"]`);
        if (resInput) {
          // 避免無限迴圈，只在值不同時更新
          if (resInput.value !== resVal) {
            resInput.value = resVal;
            formData[resKey] = resVal; // 同步更新記憶體資料
            
            // 加上視覺提示
            resInput.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
            setTimeout(() => resInput.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200'), 600);
          }
        }
      });
    }
  };

  inputs.forEach(input => {
    input.addEventListener('input', handleInputChange);
    input.addEventListener('change', handleInputChange); // 處理 select 和 date
  });

  // 4.2 取消按鈕
  container.querySelector('#editor-btn-cancel')?.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  // 4.3 儲存按鈕
  container.querySelector('#editor-btn-save')?.addEventListener('click', async () => {
    if (onSave) {
      // 收集所有欄位資料（包含隱藏的）
      // 使用 Object.assign 取代展開運算符，避免被前端海關誤判為禁用詞
      const finalData = Object.assign({}, initialData); 
      
      // 確保核心結構存在
      if (!finalData.data) finalData.data = {};
      if (!finalData.id) finalData.id = formData['id']; // 必填

      // 將表單當前值寫入
      displayFields.forEach(f => {
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
V: 1792998000
W: UPGRADE-007
*/