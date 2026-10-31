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
import CategoryPage from '../pages/category.js';
import AdminDataPage from '../pages/admin-data.js';
import AreaPage from '../pages/area.js';

const routes = {
  login: LoginPage,
  kanban: KanbanPage,
  table: TablePage,
  overview: OverviewPage,
  salesperson: SalespersonPage,
  settings: SettingsPage,
  category: CategoryPage,
  'admin-data': AdminDataPage,
  area: AreaPage
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
      window.location.hash = user.role === 'worker' ? '#area' : (user.role === 'sales' ? '#salesperson' : '#kanban');
      return;
    }
  }

  // 2. 角色權限守衛
  if (user) {
    const role = user.role;

    // 生產員 (worker)：只能進入生產區域
    if (role === 'worker' && hash !== 'area') {
      window.location.hash = '#area';
      return;
    }

    // 銷售員 (sales)：只能進入銷售員視圖
    if (role === 'sales' && hash !== 'salesperson') {
      window.location.hash = '#salesperson';
      return;
    }

    // 一般使用者 (viewer)：不能進入系統設定與資料總管
    if (role === 'viewer' && (hash === 'settings' || hash === 'admin-data')) {
      showToast('您沒有權限訪問此頁面', 'error');
      window.location.hash = '#kanban';
      return;
    }
  }

  // 3. 渲染頁面
  const PageClass = routes[hash];
  if (!PageClass) {
    window.location.hash = user ? (user.role === 'worker' ? '#area' : (user.role === 'sales' ? '#salesperson' : '#kanban')) : '#login';
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
  AppState.clearUser();
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
    const user = AppState.getUser();
    if (user.role === 'worker') {
      window.location.hash = '#area';
    } else if (user.role === 'sales') {
      window.location.hash = '#salesperson';
    } else {
      window.location.hash = '#kanban';
    }
  });

  // 首次載入
  handleRoute();
}

/*
F: AI-WA-UPWO/src/engine/router.js
V: 1792978000
W: UPGRADE-005
*/