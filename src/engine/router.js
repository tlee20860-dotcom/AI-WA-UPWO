import { AppState } from '../config/state.js';
import { renderAppShell, updateNavbar } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';

// 引入各頁面模組
import LoginPage from '../pages/login.js';
import KanbanPage from '../pages/kanban.js';
import TablePage from '../pages/table.js';
import OverviewPage from '../pages/overview.js';
import SalespersonPage from '../pages/salesperson.js';
import SettingsPage from '../pages/settings.js';

const routes = {
  login: LoginPage,
  kanban: KanbanPage,
  table: TablePage,
  overview: OverviewPage,
  salesperson: SalespersonPage,
  settings: SettingsPage
};

let currentPageInstance = null;
let isShellRendered = false;

/**
 * 處理路由變更與守衛
 */
function handleRoute() {
  let hash = window.location.hash.replace('#', '') || 'kanban';
  const user = AppState.getUser();

  // 1. 登入守衛
  if (!user) {
    if (hash !== 'login') {
      window.location.hash = '#login';
      return;
    }
  } else {
    // 已登入卻試圖去登入頁
    if (hash === 'login') {
      window.location.hash = '#kanban';
      return;
    }
  }

  // 2. 權限守衛 (Settings 僅限 admin)
  if (hash === 'settings' && user && user.role !== 'admin') {
    showToast('您沒有權限訪問系統設定', 'error');
    window.location.hash = '#kanban';
    return;
  }

  // 3. 渲染頁面
  const PageClass = routes[hash];
  if (!PageClass) {
    window.location.hash = user ? '#kanban' : '#login';
    return;
  }

  // 4. 處理 App Shell 與頁面切換
  if (hash === 'login') {
    isShellRendered = false; // 登出後重置狀態
    if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
      currentPageInstance.destroy();
    }
    currentPageInstance = PageClass;
    currentPageInstance.render();
  } else {
    // 需要 App Shell 的頁面
    if (!isShellRendered) {
      renderAppShell({
        user: user,
        onLogout: handleLogout,
        onNavigate: (route) => { window.location.hash = `#${route}`; }
      });
      isShellRendered = true;
    }

    // 更新導覽列高亮
    updateNavbar(hash);

    // 銷毀舊頁面
    if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
      currentPageInstance.destroy();
    }

    // 渲染新頁面
    currentPageInstance = PageClass;
    currentPageInstance.render();
  }
}

/**
 * 處理登出
 */
function handleLogout() {
  AppState.clearUser(); // 假設 state.js 有這個方法
  isShellRendered = false;
  window.location.hash = '#login';
  showToast('已登出系統', 'info');
}

/**
 * 初始化路由
 */
export function initRouter() {
  // 監聽 Hash 變更
  window.addEventListener('hashchange', handleRoute);

  // 監聽登入事件 (由 login.js 觸發)
  window.addEventListener('auth:login', () => {
    // 登入成功後，強制導向首頁
    window.location.hash = '#kanban';
  });

  // 首次載入
  handleRoute();
}

/* ═══ EOF ═══
F: src/engine/router.js
V: 1792903517
W: webapp-20261026-001#29
═══ */