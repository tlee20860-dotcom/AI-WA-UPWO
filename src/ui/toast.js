import { createIcons, CheckCircle2, Info, AlertCircle, X } from 'lucide';

/**
 * 顯示全域 Toast 提示
 * @param {string} message 提示訊息
 * @param {string} type 類型：'success' | 'info' | 'error' (預設 'success')
 * @param {number} duration 顯示時間（毫秒），預設 3000
 */
export function showToast(message, type = 'success', duration = 3000) {
  // 確保容器存在
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    // 置中頂部，z-index 設高，pointer-events-none 讓不點擊到時不擋路
    container.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none items-center';
    document.body.appendChild(container);
  }

  // 建立 Toast 元素
  const toast = document.createElement('div');
  toast.className = 'bg-white/90 backdrop-blur-md border border-slate-200 shadow-soft rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-medium text-slate-700 min-w-[250px] pointer-events-auto transition-all duration-300 transform -translate-y-4 opacity-0';
  
  // 設定圖示與顏色
  let iconHtml = '';
  let iconColor = 'text-emerald-500';

  if (type === 'success') {
    iconHtml = '<i data-lucide="check-circle-2" class="w-5 h-5"></i>';
  } else if (type === 'info') {
    iconHtml = '<i data-lucide="info" class="w-5 h-5"></i>';
    iconColor = 'text-blue-500';
  } else if (type === 'error') {
    iconHtml = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    iconColor = 'text-rose-500';
  }

  toast.innerHTML = `
    <div class="${iconColor}">${iconHtml}</div>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);

  // 渲染 Lucide 圖示
  // 注意：如果在 Vue/React 中，這裡會是響應式的，但我們是純 JS
  createIcons({
    icons: { CheckCircle2, Info, AlertCircle, X },
    attrs: { class: 'w-5 h-5' }
  });

  // 觸發動畫 (從上滑入)
  requestAnimationFrame(() => {
    toast.classList.remove('-translate-y-4', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // 自動銷毀
  setTimeout(() => {
    // 觸發滑出動畫
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('-translate-y-4', 'opacity-0');
    
    // 動畫結束後移除 DOM
    toast.addEventListener('transitionend', () => {
      toast.remove();
      // 如果容器空了，也一併移除（可選，保持 DOM 乾淨）
      if (container.children.length === 0) {
        container.remove();
      }
    });
  }, duration);
}

/* ═══ EOF ═══
F: src/ui/toast.js
V: 1792903508
W: webapp-20261026-001#20
═══ */