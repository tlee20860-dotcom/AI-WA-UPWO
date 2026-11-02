import { AppState } from '../config/state.js';
import { createIcons, Layers, Bell, LogOut, LayoutDashboard, Table, PieChart, Users, Settings, Activity, ClipboardList, Database, MapPin, Menu, FileEdit, Search, Sliders, Package, Shield } from 'lucide';

// 💡 更新：加入四大設定中心的選單與圖示
const ALL_ROUTES = {
  kanban: { label: '工單進度表', icon: 'layout-dashboard', roles: ['admin', 'viewer'] },
  search: { label: '全域搜尋', icon: 'search', roles: ['admin', 'viewer'] },
  table: { label: '管理總表', icon: 'table', roles: ['admin', 'viewer'] },
  overview: { label: '總狀態', icon: 'pie-chart', roles: ['admin', 'viewer'] },
  category: { label: '類別視圖', icon: 'layers', roles: ['admin', 'viewer'] },
  salesperson: { label: '銷售員', icon: 'users', roles: ['admin', 'viewer', 'sales'] },
  area: { label: '生產區域', icon: 'map-pin', roles: ['admin', 'viewer', 'worker'] },
  'settings-material': { label: '物料管理', icon: 'package', roles: ['admin'] },
  settings: { label: '生產管理設定', icon: 'settings', roles: ['admin'] },
  'settings-form': { label: '工單管理設定', icon: 'sliders', roles: ['admin'] },
  'settings-system': { label: '系統管理設定', icon: 'shield', roles: ['admin'] },
  'admin-data': { label: '資料總管', icon: 'database', roles: ['admin'] }
};

const DEFAULT_NAV_CONFIG = Object.keys(ALL_ROUTES).map(key => ({
  id: key,
  label: ALL_ROUTES[key].label,
  icon: ALL_ROUTES[key].icon,
  showSidebar: true,
  showTop: ['kanban', 'table', 'overview', 'category', 'salesperson'].includes(key),
  isEnabled: true
}));

export function renderAppShell({ user, onLogout, onNavigate }) {
  const root = document.getElementById('app-root');
  if (!root) return;

  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';

  root.innerHTML = `
    <div class="flex h-screen w-full bg-bg overflow-hidden">
      <!-- 側邊欄 (Desktop) -->
      <aside id="desktop-sidebar" class="w-64 bg-white border-r border-slate-200/50 flex-col hidden md:flex z-20 ${isCollapsed ? 'md:hidden' : ''}">
        <div class="h-16 flex items-center justify-between px-4 border-b border-slate-100 flex-shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white shadow-sm shadow-brand/30">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <span class="font-bold text-lg tracking-tight text-slate-900">UPGRADE-WO</span>
          </div>
          <button id="btn-collapse-sidebar" class="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors" title="收起側邊欄">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left-close"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>
          </button>
        </div>
        
        <nav class="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto" id="sidebar-nav"></nav>

        <div class="p-4 border-t border-slate-100 flex-shrink-0">
          <button id="btn-logout" class="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors">
            <i data-lucide="log-out" class="w-5 h-5"></i>
            登出系統
          </button>
        </div>
      </aside>

      <!-- 主內容區 -->
      <div class="flex-1 flex flex-col h-full overflow-hidden relative">
        <header class="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 sm:px-6 z-10 flex-shrink-0">
          <div class="flex items-center gap-3">
            <button id="btn-expand-sidebar" class="hidden md:block p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ${isCollapsed ? '' : 'md:hidden'}" title="展開側邊欄">
              <i data-lucide="menu" class="w-5 h-5"></i>
            </button>

            <div class="flex items-center gap-3 md:hidden">
              <button id="btn-mobile-menu" class="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
              <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white shadow-sm">
                <i data-lucide="layers" class="w-5 h-5"></i>
              </div>
              <span class="font-bold text-slate-900">UPGRADE</span>
            </div>
          </div>

          <div class="hidden md:flex segmented-control" id="top-segmented-control"></div>

          <div class="flex items-center gap-3">
            <div class="text-right hidden sm:block">
              <div class="text-sm font-bold text-slate-700">${user.username}</div>
              <div class="text-[10px] text-slate-400 uppercase tracking-wider">${user.role}</div>
            </div>
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm shadow-sm cursor-pointer">
              ${user.username.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main id="app-content" class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6"></main>
      </div>
    </div>

    <!-- 手機版側邊選單 (Drawer) -->
    <div id="mobile-drawer" class="fixed inset-0 z-50 hidden">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" id="drawer-overlay"></div>
      <aside class="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl transform -translate-x-full transition-transform duration-300 flex flex-col" id="drawer-panel">
        <div class="h-16 flex items-center px-6 border-b border-slate-100 justify-between flex-shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white shadow-sm">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <span class="font-bold text-lg text-slate-900">選單</span>
          </div>
          <button id="btn-close-drawer" class="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <nav class="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto" id="mobile-sidebar-nav"></nav>
      </aside>
    </div>
  `;

  createIcons({
    icons: { Layers, Bell, LogOut, LayoutDashboard, Table, PieChart, Users, Settings, Database, MapPin, Menu, FileEdit, Search, Sliders, Package, Shield },
    attrs: { class: 'w-5 h-5' }
  });

  const desktopSidebar = document.getElementById('desktop-sidebar');
  const btnCollapse = document.getElementById('btn-collapse-sidebar');
  const btnExpand = document.getElementById('btn-expand-sidebar');

  btnCollapse?.addEventListener('click', () => {
    desktopSidebar.classList.add('md:hidden');
    btnExpand.classList.remove('md:hidden');
    localStorage.setItem('sidebar_collapsed', 'true');
  });

  btnExpand?.addEventListener('click', () => {
    desktopSidebar.classList.remove('md:hidden');
    btnExpand.classList.add('md:hidden');
    localStorage.setItem('sidebar_collapsed', 'false');
  });

  document.getElementById('btn-logout')?.addEventListener('click', onLogout);

  const drawer = document.getElementById('mobile-drawer');
  const panel = document.getElementById('drawer-panel');
  const overlay = document.getElementById('drawer-overlay');
  
  const openDrawer = () => {
    drawer.classList.remove('hidden');
    setTimeout(() => {
      overlay.classList.add('opacity-100');
      panel.classList.remove('-translate-x-full');
    }, 10);
  };
  
  const closeDrawer = () => {
    overlay.classList.remove('opacity-100');
    panel.classList.add('-translate-x-full');
    setTimeout(() => drawer.classList.add('hidden'), 300);
  };

  document.getElementById('btn-mobile-menu')?.addEventListener('click', openDrawer);
  document.getElementById('btn-close-drawer')?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);

  renderNavBar(user, onNavigate, closeDrawer);

  window.addEventListener('nav-config-updated', () => {
    renderNavBar(user, onNavigate, closeDrawer);
    const currentHash = window.location.hash.replace('#', '') || 'kanban';
    updateNavbar(currentHash);
  });
}

function renderNavBar(user, onNavigate, closeDrawer) {
  const sidebarNav = document.getElementById('sidebar-nav');
  const topControl = document.getElementById('top-segmented-control');
  const mobileNav = document.getElementById('mobile-sidebar-nav');

  if (!sidebarNav || !topControl || !mobileNav) return;

  sidebarNav.innerHTML = '';
  topControl.innerHTML = '';
  mobileNav.innerHTML = '';

  const navConfig = AppState.getNavConfig() || DEFAULT_NAV_CONFIG;
  const role = user.role;

  navConfig.forEach(item => {
    if (item.isEnabled === false) return;

    const routeDef = ALL_ROUTES[item.id];
    if (!routeDef) return;
    if (!routeDef.roles.includes(role)) return;

    if (item.showSidebar) {
      const btn = document.createElement('button');
      btn.className = 'nav-item flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand transition-colors';
      btn.dataset.route = item.id;
      btn.innerHTML = `<i data-lucide="${item.icon}" class="w-5 h-5"></i>${item.label}`;
      btn.addEventListener('click', () => onNavigate(item.id));
      sidebarNav.appendChild(btn);

      const mobileBtn = document.createElement('button');
      mobileBtn.className = 'nav-item flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand transition-colors';
      mobileBtn.dataset.route = item.id;
      mobileBtn.innerHTML = `<i data-lucide="${item.icon}" class="w-5 h-5"></i>${item.label}`;
      mobileBtn.addEventListener('click', () => {
        onNavigate(item.id);
        if (typeof closeDrawer === 'function') closeDrawer();
      });
      mobileNav.appendChild(mobileBtn);
    }

    if (item.showTop) {
      const segment = document.createElement('div');
      segment.className = 'segment-btn';
      segment.dataset.route = item.id;
      segment.textContent = item.label;
      segment.addEventListener('click', () => onNavigate(item.id));
      topControl.appendChild(segment);
    }
  });

  createIcons({
    icons: { LayoutDashboard, Table, PieChart, Users, Settings, Layers, Database, MapPin, FileEdit, Search, Sliders, Package, Shield },
    attrs: { class: 'w-5 h-5' }
  });
}

export function updateNavbar(activeRoute) {
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.route === activeRoute) {
      item.classList.add('bg-brand/5', 'text-brand', 'font-bold');
      item.classList.remove('text-slate-600');
    } else {
      item.classList.remove('bg-brand/5', 'text-brand', 'font-bold');
      item.classList.add('text-slate-600');
    }
  });

  document.querySelectorAll('#top-segmented-control .segment-btn').forEach(item => {
    if (item.dataset.route === activeRoute) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

export function renderPageLayout({ title, subtitle = '', headerActions = '', stats = [], controls = '', listContainerId = 'page-content' }) {
  const container = document.getElementById('app-content');
  if (!container) return;

  let statsHtml = '';
  if (stats && stats.length > 0) {
    statsHtml = `
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        ${stats.map(s => `
          <div class="glass-card p-5 flex flex-col gap-2">
            <span class="text-sm text-slate-500 font-medium flex items-center gap-2">
              <i data-lucide="${s.icon || 'activity'}" class="w-4 h-4 text-brand"></i> ${s.label}
            </span>
            <span class="text-3xl font-bold text-slate-900">${s.value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">${title}</h1>
        ${subtitle ? `<p class="text-sm text-slate-500 mt-1">${subtitle}</p>` : ''}
      </div>
      <div class="flex items-center gap-3">
        ${headerActions}
      </div>
    </div>

    ${statsHtml}

    ${controls ? `<div class="w-full">${controls}</div>` : ''}

    <div id="${listContainerId}" class="flex-1 flex flex-col relative w-full"></div>
  `;

  createIcons({
    icons: { Activity, ClipboardList },
    attrs: { class: 'w-4 h-4' }
  });
}

/*
F: AI-WA-UPWO/src/ui/layout.js
V: 1793059000
W: UPGRADE-007
*/