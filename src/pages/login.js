~~~javascript
import { AppState } from '../config/state.js';
import { getCollection } from '../db/read.js';
import { showToast } from '../ui/toast.js';
import { createIcons, Layers, Lock, User } from 'lucide';

export default {
  async render() {
    // 登入頁不經過 App Shell，因此直接渲染到最外層的 app-root
    const content = document.getElementById('app-root');
    if (!content) return;

    content.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-bg">
        <div class="glass-card w-full max-w-md p-8 sm:p-10 relative overflow-hidden">
          
          <!-- 裝飾背景 -->
          <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand to-purple-500"></div>

          <div class="flex flex-col items-center mb-8">
            <div class="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center text-white shadow-lg shadow-brand/30 mb-4">
              <i data-lucide="layers" class="w-7 h-7"></i>
            </div>
            <h1 class="text-2xl font-bold text-slate-900">UPGRADE-WO</h1>
            <p class="text-sm text-slate-500 mt-1">流水線進度控制台</p>
          </div>

          <form id="login-form" class="flex flex-col gap-5">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700 ml-1">帳號</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <i data-lucide="user" class="w-5 h-5"></i>
                </div>
                <input type="text" id="username" required
                  class="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                  placeholder="請輸入帳號">
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700 ml-1">密碼</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <i data-lucide="lock" class="w-5 h-5"></i>
                </div>
                <input type="password" id="password" required
                  class="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                  placeholder="請輸入密碼">
              </div>
            </div>

            <button type="submit" id="login-btn" class="btn-primary w-full py-3 mt-2 flex justify-center items-center gap-2">
              <span>登入系統</span>
            </button>
          </form>
        </div>
      </div>
    `;

    createIcons({
      icons: { Layers, User, Lock },
      attrs: { class: 'w-5 h-5' }
    });

    this.bindEvents();
  },

  bindEvents() {
    const form = document.getElementById('login-form');
    const btn = document.getElementById('login-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const usernameInput = document.getElementById('username').value.trim();
      const passwordInput = document.getElementById('password').value;
      
      if (!usernameInput || !passwordInput) {
        showToast('請填寫帳號與密碼', 'error');
        return;
      }

      // 變更按鈕狀態
      const originalBtnHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="animate-pulse">驗證中...</span>`;

      try {
        // 從 settings 集合獲取使用者清單
        let usersList = [];
        try {
          const settingsData = await getCollection('settings');
          const userSetting = settingsData.find(s => s.id === 'users' || (s.users && Array.isArray(s.users)));
          if (userSetting) {
            usersList = userSetting.users || [];
          }
        } catch (err) {
          console.warn('無法讀取 settings，將使用預設帳密', err);
        }

        // 若資料庫完全沒有資料（全新專案），提供預設的 admin 帳號作為 Fallback
        if (usersList.length === 0) {
          usersList = [{ username: "admin", password: "123456", role: "admin", allowedAreas: [] }];
        }

        // 比對帳密
        const user = usersList.find(u => u.username === usernameInput && u.password === passwordInput);

        if (user) {
          // 登入成功：將 allowedAreas 一併存入 AppState（供區域頁面權限過濾使用）
          showToast(`歡迎回來，${user.username}`, 'success');
          AppState.setUser({
            username: user.username,
            role: user.role,
            allowedAreas: Array.isArray(user.allowedAreas) ? user.allowedAreas : []
          });
          
          // 觸發自訂事件，讓 router 接手後續畫面切換
          window.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
        } else {
          // 登入失敗
          showToast('帳號或密碼錯誤', 'error');
          btn.disabled = false;
          btn.innerHTML = originalBtnHtml;
        }

      } catch (error) {
        console.error('Login error:', error);
        showToast('登入過程發生錯誤', 'error');
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
      }
    });
  },

  destroy() {
    // 表單會隨 innerHTML 被清空，無需特別清理事件
  }
};

/* EOF
F: AI-WA-UPWO/src/pages/login.js
V: 1792936800
W: UPGRADE-005
*/