import { AppState } from '../config/state.js';
import { renderAppShell, updateNavbar } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { getDocument } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';

// 引入各頁面模組
import LoginPage from '../pages/login.js';
import KanbanPage from '../pages/kanban.js';
import TablePage from '../pages/table.js';
import OverviewPage from '../pages/overview.js';
import SalespersonPage from '../pages/salesperson.js';
import CategoryPage from '../pages/category.js';
import AdminDataPage from '../pages/admin-data.js';
import AreaPage from '../pages/area.js';
import SearchPage from '../pages/search.js';

// 引入四大設定中心
import SettingsPage from '../pages/settings.js';
import SettingsFormPage from '../pages/settings-form.js';

// 💡 引入全新的資料庫中心與系統管理
import { renderDatabaseCenter } from '../pages/settings-database.js';
import { renderSystemUsers, renderSystemData } from '../pages/settings-system.js';

// 💡 將資料庫中心包裝成標準 Page 模組
const SettingsMaterialPage = {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }
    
    let currentSettings = {};
    try {
      currentSettings = await getDocument('settings', 'main') || {};
    } catch(e) {}
    
    renderPageLayout({
      title: '資料庫中心',
      subtitle: '建立與管理系統中所有自訂資料庫（如：外發商、物料、客戶）',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-material-container'
    });

    const container = document.getElementById('settings-material-container');
    
    // 傳入儲存函數，僅更新資料庫相關欄位，保護原有資料
    const saveSettings = async (dataToSave) => {
      await updateDocument('settings', 'main', dataToSave);
      const updated = await getDocument('settings', 'main');
      renderDatabaseCenter(container, updated || {}, saveSettings);
    };

    renderDatabaseCenter(container, currentSettings, saveSettings);
  }
};

const SettingsSystemPage = {
  async render() {
    const user = AppState.getUser();
    if (!user || user.role !== 'admin') {
      document.getElementById('app-content').innerHTML = '<div class="p-8 text-center text-rose-500 font-bold">您沒有權限訪問此頁面</div>';
      return;
    }
    
    let currentSettings = {};
    try {
      currentSettings = await getDocument('settings', 'main') || {};
    } catch(e) {}

    // 獲取銷售員名單供權限設定使用
    let allSalesReps = [];
    try {
      const { getCollection } = await import('../db/read.js');
      const orders = await getCollection('work_orders');
      const reps = new Set();
      orders.forEach(o => (o.salesReps || []).forEach(r => { if(r && r !== '未填寫') reps.add(r); }));
      allSalesReps = Array.from(reps).sort();
    } catch(e) {}
    
    renderPageLayout({
      title: '系統管理設定',
      subtitle: '管理登入帳號權限與系統資料',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'settings-system-container'
    });

    const container = document.getElementById('settings-system-container');
    container.innerHTML = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden min-h-[500px] flex flex-col md:flex-row">
        <div class="w-full md:w-64 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 flex-shrink-0">
          <button id="tab-sys-users" class="bg-white text-brand shadow-sm border border-slate-200/50 text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3">
            <i data-lucide="shield" class="w-4 h-4"></i> 帳號管理
          </button>
          <button id="tab-sys-data" class="text-slate-600 hover:bg-slate-100 border border-transparent text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3">
            <i data-lucide="database" class="w-4 h-4"></i> 資料管理
          </button>
        </div>
        <div class="flex-1 p-6 md:p-8" id="sys-content"></div>
      </div>
    `;

    const contentEl = container.querySelector('#sys-content');
    const btnUsers = container.querySelector('#tab-sys-users');
    const btnData = container.querySelector('#tab-sys-data');

    const saveSettings = async (dataToSave) => {
      await updateDocument('settings', 'main', dataToSave);
      const updated = await getDocument('settings', 'main');
      currentSettings = updated || {};
    };

    const renderUsers = () => {
      btnUsers.className = 'bg-white text-brand shadow-sm border border-slate-200/50 text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3';
      btnData.className = 'text-slate-600 hover:bg-slate-100 border border-transparent text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3';
      renderSystemUsers(contentEl, currentSettings, saveSettings, allSalesReps);
    };

    const renderData = () => {
      btnData.className = 'bg-white text-brand shadow-sm border border-slate-200/50 text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3';
      btnUsers.className = 'text-slate-600 hover:bg-slate-100 border border-transparent text-left px-4 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-3';
      renderSystemData(contentEl, currentSettings, saveSettings);
    };

    btnUsers.addEventListener('click', renderUsers);
    btnData.addEventListener('click', renderData);

    // 預設顯示帳號管理
    renderUsers();
    
    // 渲染圖示
    import('lucide').then(({ createIcons, Shield, Database }) => {
      createIcons({ icons: { Shield, Database }, attrs: { class: 'w-4 h-4' } });
    });
  }
};

const routes = {
  login: LoginPage,
  kanban: KanbanPage,
  table: TablePage,
  overview: OverviewPage,
  salesperson: SalespersonPage,
  category: CategoryPage,
  'admin-data': AdminDataPage,
  area: AreaPage,
  search: SearchPage,
  settings: SettingsPage,
  'settings-form': SettingsFormPage,
  'settings-material': SettingsMaterialPage,
  'settings-system': SettingsSystemPage
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

    const isSettingsPage = ['settings', 'settings-form', 'settings-material', 'settings-system', 'admin-data'].includes(hash);
    if (role === 'viewer' && isSettingsPage) {
      showToast('您沒有權限訪問此頁面', 'error');
      window.location.hash = '#kanban';
      return;
    }

    const navConfig = AppState.getNavConfig();
    if (navConfig) {
      const routeConfig = navConfig.find(r => r.id === hash);
      if (routeConfig && routeConfig.isEnabled === false) {
        showToast('該頁面已被停用', 'error');
        window.location.hash = '#table';
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
V: 1793087000
W: UPGRADE-007
*/