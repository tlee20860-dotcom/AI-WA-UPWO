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
  // 將初始資料攤平，方便表單綁定 (核心欄位在外層，data 在內層)
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
    <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col h-full">
      <!-- Header (固定) -->
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-slate-800">${initialData ? '編輯工單' : '新增工單'}</h2>
          <span class="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">${isViewMode ? '檢視模式' : '編輯模式'}</span>
          ${layoutMode === 'B' ? `
          <div class="ml-4 flex bg-slate-200 p-0.5 rounded-lg">
            <button class="tab-btn px-3 py-1 text-sm rounded-md font-medium bg-white text-brand shadow-sm" data-tab="basic">基本</button>
            <button class="tab-btn px-3 py-1 text-sm rounded-md font-medium text-slate-600 hover:text-slate-800" data-tab="amount">金額</button>
            <button class="tab-btn px-3 py-1 text-sm rounded-md font-medium text-slate-600 hover:text-slate-800" data-tab="status">狀態與日期</button>
          </div>
          ` : ''}
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
      <div class="flex-1 overflow-y-auto p-6 bg-slate-50/30 min-h-0 relative" id="editor-body">
  `;

  // 根據佈局模式決定 Body 內部結構
  if (layoutMode === 'C') {
    // 模式 C：左右對照 (左側留白或放清單，這裡由外部處理，這裡只負責右側表單區)
    // 假設外部已經提供了一個左右分欄的容器，這裡我們只渲染表單區塊
    html += `
      <div class="max-w-4xl mx-auto flex flex-col gap-6">
        ${renderFormGroups(displayFields, formData, isViewMode, '')} 
      </div>
    `;
  } else if (layoutMode === 'A') {
    // 模式 A：一頁到底 (加上折疊面板)
    html += `
      <div class="max-w-4xl mx-auto flex flex-col gap-4">
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
           <div class="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 cursor-pointer accordion-header">
             <i data-lucide="layers" class="w-4 h-4"></i> 基本與金額資料
           </div>
           <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 accordion-content">
              ${renderFormGroups(displayFields, formData, isViewMode, 'A')}
           </div>
        </div>
      </div>
    `;
  } else {
    // 模式 B：分頁 Tabs (預設)
    // 依規則簡單分類：基本(id, salesRep, customCategory...) / 金額(amount...) / 狀態日期(status, dueDate...)
    // 為簡化實作，此處假設我們會用 data-tab 屬性來控制顯示。
    // 實際應用中，如果 schema 有分類屬性，應該讀取它；若無，則按 key 猜測。
    html += `
      <div class="max-w-4xl mx-auto relative h-full">
        <!-- Tab 1: Basic -->
        <div class="form-tab-content grid grid-cols-1 md:grid-cols-2 gap-6" data-content="basic">
          ${renderFormGroups(displayFields.filter(isBasicField), formData, isViewMode, 'B')}
        </div>
        
        <!-- Tab 2: Amount -->
        <div class="form-tab-content hidden grid-cols-1 md:grid-cols-2 gap-6" data-content="amount">
          ${renderFormGroups(displayFields.filter(isAmountField), formData, isViewMode, 'B')}
        </div>

        <!-- Tab 3: Status & Date -->
        <div class="form-tab-content hidden grid-cols-1 md:grid-cols-2 gap-6" data-content="status">
          ${renderFormGroups(displayFields.filter(isStatusField), formData, isViewMode, 'B')}
        </div>
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
  createIcons({ icons: { Save, RotateCcw, Layers, List, Columns }, attrs: { class: 'w-4 h-4' } });

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
          resInput.value = resVal;
          formData[resKey] = resVal; // 同步更新記憶體資料
          
          // 加上視覺提示
          resInput.classList.add('bg-emerald-50', 'text-emerald-700');
          setTimeout(() => resInput.classList.remove('bg-emerald-50', 'text-emerald-700'), 500);
        }
      });
    }
  };

  inputs.forEach(input => {
    input.addEventListener('input', handleInputChange);
    input.addEventListener('change', handleInputChange); // 處理 select 和 date
  });

  // 4.2 分頁切換 (模式 B)
  if (layoutMode === 'B') {
    const tabBtns = container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // 切換按鈕樣式
        tabBtns.forEach(b => {
          b.classList.remove('bg-white', 'text-brand', 'shadow-sm');
          b.classList.add('text-slate-600');
        });
        btn.classList.add('bg-white', 'text-brand', 'shadow-sm');
        btn.classList.remove('text-slate-600');

        // 切換內容顯示
        const targetTab = btn.dataset.tab;
        bodyEl.querySelectorAll('.form-tab-content').forEach(content => {
          if (content.dataset.content === targetTab) {
            content.classList.remove('hidden');
            content.classList.add('grid');
          } else {
            content.classList.add('hidden');
            content.classList.remove('grid');
          }
        });
      });
    });
  }

  // 4.3 取消按鈕
  container.querySelector('#editor-btn-cancel')?.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  // 4.4 儲存按鈕
  container.querySelector('#editor-btn-save')?.addEventListener('click', async () => {
    if (onSave) {
      // 收集所有欄位資料（包含隱藏的）
      // 注意：此處僅收集 displayFields 中的資料，若有些欄位未顯示但有初始值，需保留。
      const finalData = { ...initialData }; // 從初始資料開始
      
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

/**
 * 輔助函數：渲染輸入欄位群組
 * 若無明確分類，則按順序平鋪。
 */
function renderFormGroups(fields, data, isViewMode, layoutMode) {
  if (!fields || fields.length === 0) return '<div class="text-slate-400 text-sm col-span-2">此區塊無欄位</div>';
  
  return fields.map(f => {
    const value = data[f.key] !== undefined ? data[f.key] : '';
    const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
    const disabledAttr = isViewMode ? 'disabled' : '';
    const baseClass = `w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors ${isViewMode ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''}`;

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
  }).join('');
}

// 輔助函數：簡易欄位分類器 (針對模式 B)
// 實際專案中可透過 schema 的額外屬性來定義，此處先寫死常見邏輯
function isBasicField(f) {
  const basicKeys = ['id', 'customerNameZh', 'customerNameEn', 'salesRep', 'customCategory'];
  return basicKeys.includes(f.key) || f.key.startsWith('field_') && !f.label.includes('金額');
}
function isAmountField(f) {
  const amountKeys = ['amount', 'quantity', 'price', 'cost'];
  return amountKeys.includes(f.key) || f.label.includes('金額') || f.label.includes('費用') || f.label.includes('單價');
}
function isStatusField(f) {
  const statusKeys = ['status', 'dueDate', 'uploadDate', 'statusUpdateDate', 'route'];
  return statusKeys.includes(f.key);
}

/*
F: AI-WA-UPWO/src/ui/order-editor.js
V: 1792992000
W: UPGRADE-007
*/