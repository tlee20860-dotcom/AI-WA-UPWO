import { createIcons, Layers, Bell, LogOut, LayoutDashboard, Table, PieChart, Users, Settings, Activity, ClipboardList } from 'lucide';

/**
 * 繪製 App Shell 骨架（側邊欄、頂部導覽列）
 * @param {Object} options
 * @param {Object} options.user 當前登入使用者 (需含 username, role)
 * @param {function} options.onLogout 登出回呼
 * @param {function} options.onNavigate 切換視圖回呼 (接收 route)
 */
export function renderAppShell({ user, onLogout, onNavigate }) {
  const root = document.getElementById('app-root');
  if (!root) return;

  // 清空並建立新的骨架
  root.innerHTML = `
    <div class="flex h-screen w-full bg-bg overflow-hidden">
      <!-- 側邊欄 (Desktop) -->
      <aside class="w-64 bg-white border-r border-slate-200/50 flex-col hidden md:flex z-20">
        <div class="h-16 flex items-center px-6 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white shadow-sm shadow-brand/30">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <span class="font-bold text-lg tracking-tight text-slate-900">UPGRADE-WO</span>
          </div>
        </div>
        
        <nav class="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto" id="sidebar-nav">
          <!-- 導覽按鈕由 renderNavItems 注入 -->
        </nav>

        <div class="p-4 border-t border-slate-100">
          <button id="btn-logout" class="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors">
            <i data-lucide="log-out" class="w-5 h-5"></i>
            登出系統
          </button>
        </div>
      </aside>

      <!-- 主內容區 -->
      <div class="flex-1 flex flex-col h-full overflow-hidden relative">
        <!-- 頂部導覽 (Mobile & Desktop) -->
        <header class="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-4 sm:px-6 z-10">
          <!-- Mobile Logo & Menu Button -->
          <div class="flex items-center gap-3 md:hidden">
            <button id="btn-mobile-menu" class="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white shadow-sm">
              <i data-lucide="layers" class="w-5 h-5"></i>
            </div>
            <span class="font-bold text-slate-900">UPGRADE</span>
          </div>

          <!-- 中間：iOS Segmented Control (視圖切換) - Desktop -->
          <div class="hidden md:flex segmented-control" id="top-segmented-control">
            <!-- 由 renderNavItems 動態注入 -->
          </div>

          <!-- 右側：使用者資訊 -->
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

        <!-- 頁面渲染容器 -->
        <main id="app-content" class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
          <!-- 各頁面內容會注入這裡 -->
        </main>
      </div>
    </div>

    <!-- 手機版側邊選單 (Drawer) -->
    <div id="mobile-drawer" class="fixed inset-0 z-50 hidden">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" id="drawer-overlay"></div>
      <aside class="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl transform -translate-x-full transition-transform duration-300 flex flex-col" id="drawer-panel">
        <div class="h-16 flex items-center px-6 border-b border-slate-100 justify-between">
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
        <nav class="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto" id="mobile-sidebar-nav">
          <!-- 由 renderNavItems 注入 -->
        </nav>
      </aside>
    </div>
  `;

  // 渲染圖示
  createIcons({
    icons: { Layers, Bell, LogOut, LayoutDashboard, Table, PieChart, Users, Settings },
    attrs: { class: 'w-5 h-5' }
  });

  // 綁定事件
  document.getElementById('btn-logout')?.addEventListener('click', onLogout);

  // 手機版抽屜選單事件
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

  // 渲染導覽選單
  renderNavItems(user.role, onNavigate, closeDrawer);
}

/**
 * 繪製導覽選單項目
 */
function renderNavItems(role, onNavigate, closeDrawer) {
  const routes = [
    { id: 'kanban', label: '工單進度表', icon: 'layout-dashboard', roles: ['admin', 'user'] },
    { id: 'table', label: '管理總表', icon: 'table', roles: ['admin', 'user'] },
    { id: 'overview', label: '總狀態', icon: 'pie-chart', roles: ['admin', 'user'] },
    { id: 'category', label: '類別視圖', icon: 'layers', roles: ['admin', 'user'] },
    { id: 'salesperson', label: '銷售員', icon: 'users', roles: ['admin', 'user'] },
    { id: 'settings', label: '系統設定', icon: 'settings', roles: ['admin'] }
  ];

  const sidebarNav = document.getElementById('sidebar-nav');
  const topControl = document.getElementById('top-segmented-control');
  const mobileNav = document.getElementById('mobile-sidebar-nav');

  routes.forEach(route => {
    if (!route.roles.includes(role)) return;

    // 側邊欄項目
    if (sidebarNav) {
      const btn = document.createElement('button');
      btn.className = 'nav-item flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand transition-colors';
      btn.dataset.route = route.id;
      btn.innerHTML = `
        <i data-lucide="${route.icon}" class="w-5 h-5"></i>
        ${route.label}
      `;
      btn.addEventListener('click', () => onNavigate(route.id));
      sidebarNav.appendChild(btn);
    }

    // 手機版側邊欄項目
    if (mobileNav) {
      const btn = document.createElement('button');
      btn.className = 'nav-item flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand transition-colors';
      btn.dataset.route = route.id;
      btn.innerHTML = `
        <i data-lucide="${route.icon}" class="w-5 h-5"></i>
        ${route.label}
      `;
      btn.addEventListener('click', () => {
        onNavigate(route.id);
        if (typeof closeDrawer === 'function') closeDrawer();
      });
      mobileNav.appendChild(btn);
    }

    // 頂部 Segmented Control 項目
    if (topControl) {
      const segment = document.createElement('div');
      segment.className = 'segment-btn';
      segment.dataset.route = route.id;
      segment.textContent = route.label;
      segment.addEventListener('click', () => onNavigate(route.id));
      topControl.appendChild(segment);
    }
  });

  createIcons({
    icons: { LayoutDashboard, Table, PieChart, Users, Settings, Layers },
    attrs: { class: 'w-5 h-5' }
  });
}

/**
 * 更新當前選中的導覽狀態
 * @param {string} activeRoute 
 */
export function updateNavbar(activeRoute) {
  // 更新側邊欄
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.route === activeRoute) {
      item.classList.add('bg-brand/5', 'text-brand', 'font-bold');
      item.classList.remove('text-slate-600');
    } else {
      item.classList.remove('bg-brand/5', 'text-brand', 'font-bold');
      item.classList.add('text-slate-600');
    }
  });

  // 更新頂部 Segmented Control
  document.querySelectorAll('#top-segmented-control .segment-btn').forEach(item => {
    if (item.dataset.route === activeRoute) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * 統一的頁面佈局渲染
 * @param {Object} options
 * @param {string} options.title 頁面標題
 * @param {string} options.subtitle 副標題
 * @param {string} options.headerActions 右上角操作按鈕 HTML
 * @param {Array} options.stats 統計卡片資料
 * @param {string} options.controls 控制列 HTML
 * @param {string} options.listContainerId 內容容器 ID
 */
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
    <!-- 標題與操作區 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">${title}</h1>
        ${subtitle ? `<p class="text-sm text-slate-500 mt-1">${subtitle}</p>` : ''}
      </div>
      <div class="flex items-center gap-3">
        ${headerActions}
      </div>
    </div>

    <!-- 統計卡片 -->
    ${statsHtml}

    <!-- 控制列 -->
    ${controls ? `<div class="w-full">${controls}</div>` : ''}

    <!-- 主內容容器 -->
    <div id="${listContainerId}" class="flex-1 flex flex-col relative w-full">
      <!-- 內容由各頁面自行渲染 -->
    </div>
  `;

  // 重新渲染圖示（補上缺少的參數）
  createIcons({
    icons: { Activity, ClipboardList },
    attrs: { class: 'w-4 h-4' }
  });
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/layout.js
V: 1792914600
W: UPGRADE-002
═══ */