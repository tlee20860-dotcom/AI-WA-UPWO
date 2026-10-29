import { createIcons, X } from 'lucide';

/**
 * 建立並顯示一個 Modal（三層架構：標題、滾動內容、固定底部）
 * @param {Object} options 設定選項
 * @param {string} options.title 標題
 * @param {string} options.content 內容 HTML
 * @param {string} options.footer 底部按鈕區 HTML（可選）
 * @param {function} options.onClose 關閉時的回呼
 * @returns {Object} 包含 close 方法的物件，可手動關閉
 */
export function openModal({ title, content, footer = '', onClose }) {
  // 建立遮罩與容器
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-300 opacity-0 p-4';
  
  const modal = document.createElement('div');
  // 使用 flex flex-col 與 max-h-[90vh] 確保內容不會撐破螢幕
  modal.className = 'bg-white border border-slate-100 shadow-soft rounded-[20px] w-full max-w-md flex flex-col max-h-[90vh] transform transition-transform duration-300 scale-95 overflow-hidden';
  
  modal.innerHTML = `
    <div class="flex justify-between items-center p-5 border-b border-slate-100 flex-shrink-0">
      <h3 class="text-lg font-bold text-slate-900">${title}</h3>
      <button id="modal-close-btn" class="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-full">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>
    <div class="p-5 text-slate-600 overflow-y-auto flex-1 min-h-0">
      ${content}
    </div>
    ${footer ? `
      <div class="p-4 border-t border-slate-100 flex-shrink-0 bg-white">
        ${footer}
      </div>
    ` : ''}
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  createIcons({
    icons: { X },
    attrs: { class: 'w-5 h-5' }
  });

  // 進場動畫
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    modal.classList.remove('scale-95');
    modal.classList.add('scale-100');
  });

  // 關閉邏輯
  const close = () => {
    overlay.classList.add('opacity-0');
    modal.classList.remove('scale-100');
    modal.classList.add('scale-95');
    
    setTimeout(() => {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    }, 300); // 等待動畫結束
  };

  // 綁定事件
  modal.querySelector('#modal-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // 點擊遮罩關閉
  });

  return { close, element: modal };
}

/**
 * 顯示確認對話框 (Promise 包裝)
 * @param {Object} options 設定選項
 * @param {string} options.title 標題
 * @param {string} options.message 訊息內容
 * @param {string} options.confirmText 確認按鈕文字 (預設 '確認')
 * @param {string} options.cancelText 取消按鈕文字 (預設 '取消')
 * @param {boolean} options.isDanger 是否為危險操作 (紅色按鈕)
 * @returns {Promise<boolean>} 使用者點擊確認回傳 true，取消回傳 false
 */
export function openConfirm({ title, message, confirmText = '確認', cancelText = '取消', isDanger = false }) {
  return new Promise((resolve) => {
    const btnClass = isDanger 
      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20' 
      : 'bg-brand hover:bg-brand-hover text-white shadow-brand/20';

    const content = `
      <p class="text-slate-600">${message}</p>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
          ${cancelText}
        </button>
        <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 shadow-md ${btnClass}">
          ${confirmText}
        </button>
      </div>
    `;

    const { close, element } = openModal({
      title,
      content,
      footer,
      onClose: () => resolve(false) // 若透過右上角 X 或遮罩關閉，視為取消
    });

    // 覆寫按鈕事件
    element.querySelector('#modal-cancel-btn').addEventListener('click', () => {
      close();
    });

    element.querySelector('#modal-confirm-btn').addEventListener('click', () => {
      // 避免觸發 onClose 的 resolve(false)
      element.querySelector('#modal-close-btn').removeEventListener('click', close);
      element.parentElement.removeEventListener('click', close); 
      
      // 直接觸發動畫並移除
      element.parentElement.classList.add('opacity-0');
      element.classList.remove('scale-100');
      element.classList.add('scale-95');
      setTimeout(() => {
        element.parentElement.remove();
        resolve(true);
      }, 300);
    });
  });
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/modal.js
V: 1792927000
W: UPGRADE-004
═══ */