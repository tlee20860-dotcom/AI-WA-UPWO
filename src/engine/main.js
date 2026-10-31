import { initRouter } from './router.js';
import { getCollection, listenDocument, listenCollection } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { AppState } from '../config/state.js';
import '../ui/order-view-editor.js';

let orderCache = {}; // 用於比對工單狀態是否改變
let isFirstLoad = true;

/**
 * 系統啟動入口
 */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  
  if (!root) {
    console.error('[System Error] 找不到 #app-root 容器，無法啟動系統。');
    return;
  }

  // 隱藏初始載入動畫
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  try {
    // 1. 啟動路由系統
    initRouter();
    console.log('[System] UPGRADE-WO 系統啟動成功。');

    // 2. 全域監聽設定檔變更
    listenSettingsUpdates();

    // 3. 背景任務：自動修正歷史錯誤日期
    fixLegacyDatesInBackground();

    // 4. 註冊 Service Worker (PWA)
    registerServiceWorker();
    
    // 5. 初始化通知權限與監聽
    initNotifications();
    
  } catch (error) {
    console.error('[System Error] 系統啟動失敗:', error);
    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-bg text-slate-600">
        <div class="glass-card p-8 text-center max-w-md">
          <h2 class="text-xl font-bold text-rose-500 mb-2">系統啟動失敗</h2>
          <p class="text-sm">請檢查 Console 錯誤訊息，或重新整理頁面。</p>
        </div>
      </div>
    `;
  }
});

/**
 * 全域監聽設定檔變更
 */
function listenSettingsUpdates() {
  listenDocument('settings', 'main', (data) => {
    if (!data) return;
    
    // 更新 AppState 中的全域狀態
    if (data.statuses) AppState.setStatuses(data.statuses);
    
    // 派發事件，通知所有前台頁面重新渲染
    window.dispatchEvent(new Event('settings-updated'));
  });
}

/**
 * 初始化瀏覽器通知權限與監聽
 */
function initNotifications() {
  if (!("Notification" in window)) {
    console.log("此瀏覽器不支援桌面通知");
    return;
  }

  // 請求權限
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('[Notification] 已獲得通知權限');
      }
    });
  }

  // 僅在已登入狀態下監聽工單變化
  // 透過 setInterval 檢查登入狀態，確保登入後才開始監聽
  const checkUserInterval = setInterval(() => {
    const user = AppState.getUser();
    if (user) {
      clearInterval(checkUserInterval);
      startOrderNotificationListener(user);
    }
  }, 1000);
}

/**
 * 監聽工單變化並發送通知
 */
async function startOrderNotificationListener(user) {
  // 預先取得設定（區域設定）
  let currentSettings = null;
  try {
    const settingsData = await getCollection('settings');
    currentSettings = settingsData.find(s => s.id === 'main');
  } catch (err) {
    console.warn('[Notification] 無法讀取系統設定，通知可能無法運作', err);
  }

  listenCollection('work_orders', (orders) => {
    const newCache = {};
    
    // 第一次載入只建立快取，不發送通知
    if (isFirstLoad) {
      orders.forEach(o => { newCache[o.id] = o.status; });
      orderCache = newCache;
      isFirstLoad = false;
      return;
    }

    let notificationsToSend = [];

    orders.forEach(order => {
      newCache[order.id] = order.status;
      const oldStatus = orderCache[order.id];

      // 若狀態有改變（且舊狀態存在）
      if (oldStatus && oldStatus !== order.status) {
        // 檢查是否應該通知當前使用者
        if (shouldNotify(user, order, currentSettings)) {
          notificationsToSend.push(`工單 ${order.id} 已更新至：${order.status}`);
        }
      }
    });

    orderCache = newCache;

    // 發送通知
    if (notificationsToSend.length > 0 && Notification.permission === 'granted') {
      // 如果一次有多筆，只彈出第一筆並顯示總數，避免洗版
      let bodyText = notificationsToSend[0];
      if (notificationsToSend.length > 1) {
        bodyText += ` (及其他 ${notificationsToSend.length - 1} 筆更新)`;
      }

      try {
        new Notification('UPGRADE-WO 進度更新', {
          body: bodyText,
          icon: '/icons/icon.png'
        });
      } catch (e) {
        console.warn('發送通知失敗 (可能被瀏覽器靜音):', e);
      }
    }
  });
}

/**
 * 判斷當前使用者是否需要收到該工單的通知
 */
function shouldNotify(user, order, settings) {
  if (!user) return false;

  // 管理員與一般使用者預設不推播（避免太吵）
  if (user.role === 'admin' || user.role === 'viewer') return false;

  // 生產員：檢查新狀態是否在該使用者負責的區域內
  if (user.role === 'worker') {
    if (!settings || !settings.areas) return false;
    const allowedAreas = Array.isArray(user.allowedAreas) ? user.allowedAreas : [];
    if (allowedAreas.length === 0) return false; // 未設定可見區域，不通知

    const matchedAreas = settings.areas.filter(a => allowedAreas.includes(a.id));
    // 檢查該工單的新狀態，是否存在於任何一個該使用者負責的區域中
    for (const area of matchedAreas) {
      if ((area.statuses || []).includes(order.status)) {
        return true;
      }
    }
    return false;
  }

  // 銷售員：檢查該工單是否屬於該銷售員（或他負責的銷售員）
  if (user.role === 'sales') {
    const orderReps = order.salesReps || [];
    const allowedSales = Array.isArray(user.allowedSales) ? user.allowedSales : [];

    // 如果他有被指定可見的銷售員，檢查工單是否包含在內
    if (allowedSales.length > 0) {
      return orderReps.some(rep => allowedSales.includes(rep));
    } else {
      // 如果沒指定，檢查工單的銷售員名字是否等於他的登入帳號
      return orderReps.includes(user.username);
    }
  }

  return false;
}

/**
 * 將 Excel 日期序列號轉換為 YYYY-MM-DD 格式
 */
function formatDate(val) {
  if (!val) return "";
  if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
    return val.trim();
  }
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  return String(val).trim();
}

/**
 * 背景自動修正歷史資料中的錯誤日期（例如 46300 轉為 YYYY-MM-DD）
 */
async function fixLegacyDatesInBackground() {
  try {
    const userStr = sessionStorage.getItem('upgrade_user');
    if (!userStr) return; // 未登入不執行
    
    const orders = await getCollection('work_orders');
    let fixCount = 0;

    for (const order of orders) {
      let needsUpdate = false;
      const updates = {};

      // 檢查 uploadDate
      if (order.uploadDate && (typeof order.uploadDate === 'number' || (typeof order.uploadDate === 'string' && !order.uploadDate.includes('-')))) {
        const formatted = formatDate(order.uploadDate);
        if (formatted !== order.uploadDate && formatted !== '') {
          updates.uploadDate = formatted;
          needsUpdate = true;
        }
      }

      // 檢查 dueDate
      if (order.dueDate && (typeof order.dueDate === 'number' || (typeof order.dueDate === 'string' && !order.dueDate.includes('-')))) {
        const formatted = formatDate(order.dueDate);
        if (formatted !== order.dueDate && formatted !== '') {
          updates.dueDate = formatted;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await updateDocument('work_orders', order.id, updates);
        fixCount++;
      }
    }

    if (fixCount > 0) {
      console.log(`[System] 背景自動修正了 ${fixCount} 筆工單的日期格式。`);
      // 觸發事件讓當前頁面重新渲染
      window.dispatchEvent(new Event('data:dates-fixed'));
    }

  } catch (error) {
    console.warn('[System Background Task] 自動修正日期時發生錯誤:', error);
  }
}

/**
 * 註冊 Service Worker 以啟用 PWA 功能
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] ServiceWorker 註冊成功，範圍為:', registration.scope);
        })
        .catch((error) => {
          console.warn('[PWA] ServiceWorker 註冊失敗:', error);
        });
    });
  }
}

/*
F: AI-WA-UPWO/src/engine/main.js
V: 1792985000
W: UPGRADE-005
*/