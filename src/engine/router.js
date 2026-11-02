import { AppState } from '../config/state.js';
import { renderAppShell, updateNavbar } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';

import LoginPage from '../pages/login.js';
import KanbanPage from '../pages/kanban.js';
import TablePage from '../pages/table.js';
import OverviewPage from '../pages/overview.js';
import SalespersonPage from '../pages/salesperson.js';
import SettingsPage from '../pages/settings.js';
import SettingsFormPage from '../pages/settings-form.js';
import CategoryPage from '../pages/category.js';
import AdminDataPage from '../pages/admin-data.js';
import AreaPage from '../pages/area.js';
import DataEntryPage from '../pages/data-entry.js'; // 保留以防舊網址
import SearchPage from '../pages/search.js';

const routes = {
  login: LoginPage,
  kanban: KanbanPage,
  table: TablePage,
  overview: OverviewPage,
  salesperson: SalespersonPage,
  settings: SettingsPage,
  'settings-form': SettingsFormPage,
  category: CategoryPage,
  'admin-data': AdminDataPage,
  area: AreaPage,
  'data-entry': DataEntryPage,
  search: SearchPage
};

let currentPageInstance = null;
let isShellRendered = false;

function handleRoute() {
  let hash = window.location.hash.replace('#', '') || 'kanban';
  const user = AppState.getUser();

  if (!user) {
    if (hash !== 'login') {
      window.location.hash = '#login';
      return;
    }
  } else {
    if (hash === 'login') {
      window.location.hash = user.role === 'worker' ? '#area' : (user.role === 'sales' ? '#salesperson' : '#kanban');
      return;
    }
  }

  if (user) {
    const role = user.role;

    if (role === 'worker' && hash !== 'area') {
      window.location.hash = '#area';
      return;
    }

    if (role === 'sales' && hash !== 'salesperson') {
      window.location.hash = '#salesperson';
      return;
    }

    if (role === 'viewer' && (hash === 'settings' || hash === 'settings-form' || hash === 'admin-data' || hash === 'data-entry')) {
      showToast('您沒有權限訪問此頁面', 'error');
      window.location.hash = '#kanban';
      return;
    }

    // 💡 路由守衛：攔截已停用的頁面
    const navConfig = AppState.getNavConfig();
    if (navConfig) {
      const routeConfig = navConfig.find(r => r.id === hash);
      if (routeConfig && routeConfig.isEnabled === false) {
        showToast('該頁面已被停用', 'error');
        window.location.hash = '#table'; // 踢回總表
        return;
      }
    }
  }

  const PageClass = routes[hash];
  if (!PageClass) {
    window.location.hash = user ? (user.role === 'worker' ? '#area' : (user.role === 'sales' ? '#salesperson' : '#kanban')) : '#login';
    return;
  }

  if (hash === 'login') {
    isShellRendered = false;
    if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
      currentPageInstance.destroy();
    }
    currentPageInstance = PageClass;
    currentPageInstance.render();
  } else {
    if (!isShellRendered) {
      renderAppShell({
        user: user,
        onLogout: handleLogout,
        onNavigate: (route) => { window.location.hash = `#${route}`; }
      });
      isShellRendered = true;
    }

    updateNavbar(hash);

    if (currentPageInstance && typeof currentPageInstance.destroy === 'function') {
      currentPageInstance.destroy();
    }

    currentPageInstance = PageClass;
    currentPageInstance.render();
  }
}

function handleLogout() {
  AppState.clearUser();
  isShellRendered = false;
  window.location.hash = '#login';
  showToast('已登出系統', 'info');
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);

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

  handleRoute();
}

/*
F: AI-WA-UPWO/src/engine/router.js
V: 1793032000
W: UPGRADE-007
*/