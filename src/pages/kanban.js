import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { parseExcelData } from '../domain/parser.js';
import { checkDiff } from '../domain/data-diff.js';
import * as XLSX from 'xlsx';
import { createIcons } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let currentCategory = 'ALL';
let schema = [];
let viewConfig = {};
let route_templates = [];
let settingsCategories = [];
let diffFields = [];

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        route_templates = settingsDoc.route_templates || [];
        settingsCategories = settingsDoc.categories || [];
        diffFields = settingsDoc.diff_fields || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '生產進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: '', 
      controls: `
        <div id="category-tabs" class="flex flex-wrap gap-2 mb-4"></div>
      `,
      listContainerId: 'kanban-container'
    });

    window.addEventListener('refresh-kanban', this.updateUI.bind(this));
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          route_templates = settingsDoc.route_templates || [];
          settingsCategories = settingsDoc.categories || [];
          diffFields = settingsDoc.diff_fields || [];
          this.updateUI();
        }
      } catch (err) {}
    });
    
    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateUI();
    });
  },

  updateUI() {
    const orderCats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他')));
    const combinedCats = settingsCategories.concat(orderCats);
    const allCats = Array.from(new Set(combinedCats)).filter(c => c !== 'ALL').sort();

    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      const tabs = ['ALL'].concat(allCats);
      tabsContainer.innerHTML = tabs.map(c => {
        const label = c === 'ALL' ? '全部類別' : c;
        const count = c === 'ALL' 
          ? currentOrders.length 
          : currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === c).length;
        
        return `
          <button class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${c === currentCategory ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-cat="${c}">
            <span>${label}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-md ${c === currentCategory ? 'bg-white/20' : 'bg-slate-100'}">${count}</span>
          </button>
        `;
      }).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentCategory = btn.dataset.cat; this.updateUI(); };
      });
    }

    let filtered = currentOrders;
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    const visibleFields = (viewConfig['kanban'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'kanban-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'kanban',
      route_templates: route_templates,
      groupBy: 'status', // 確保看板保留狀態上下步功能
      onAction: async (action, id, newStatus) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'status_change') {
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  async processExcelFile(file, isAuto = false) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
          const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
          
          if (jsonData.length === 0) {
            if (!isAuto) showToast('無資料', 'error');
            resolve();
            return;
          }

          if (!isAuto) showToast('解析中...', 'info');
          
          let salesMapping = [], statuses = AppState.getStatuses() || ['排產中'];
          let routeTemplates = [];
          let latestSettings = null;
          
          try {
            latestSettings = await getDocument('settings', 'main');
            if (latestSettings) { 
              salesMapping = latestSettings.sales_mapping || []; 
              statuses = latestSettings.statuses || statuses; 
              schema = latestSettings.schema || schema; 
              routeTemplates = latestSettings.route_templates || [];
              diffFields = latestSettings.diff_fields || [];
            }
          } catch (err) {}

          const parsed = parseExcelData(jsonData[0], jsonData.slice(1), salesMapping, statuses[0], schema);
          let added = 0, updated = 0, diffCount = 0;
          let newCategoriesAdded = false;
          let currentCategories = latestSettings && Array.isArray(latestSettings.categories) ? [...latestSettings.categories] : [];

          for (const order of parsed) {
            // 💡 自動同步類別：若發現新類別，則加入陣列
            const cat = String(order.data.category || '其他').toUpperCase().trim();
            if (cat && cat !== '其他' && !currentCategories.includes(cat)) {
              currentCategories.push(cat);
              newCategoriesAdded = true;
            }

            const existing = await getDocument('work_orders', order.id);
            if (existing) {
              if (existing.source === 'manual') {
                const diffResult = checkDiff(existing, order, diffFields);
                if (diffResult) {
                  await updateDocument('work_orders', order.id, { diff: diffResult });
                  diffCount++;
                }
              } else {
                // 防覆寫：不更新 status, route, dueDate (保留手動修改)，但更新 uploadDate (以 Excel 為準)
                await updateDocument('work_orders', order.id, { 
                  salesReps: order.salesReps, 
                  uploadDate: order.uploadDate,
                  data: order.data 
                });
                updated++;
              }
            } else {
              const orderCategory = cat;
              let matchedTemplate = routeTemplates.find(t => {
                // 強化比對邏輯，去除空白並轉大寫
                if (t.categories && Array.isArray(t.categories) && t.categories.length > 0) {
                  return t.categories.map(c => String(c).toUpperCase().trim()).includes(orderCategory);
                }
                if (typeof t.category === 'string' && t.category.trim() !== '') {
                  return t.category.toUpperCase().trim() === orderCategory;
                }
                return false;
              });
              
              if (!matchedTemplate) {
                matchedTemplate = routeTemplates.find(t => (!t.categories || t.categories.length === 0) && (!t.category || t.category.trim() === ''));
              }

              if (!order.route || order.route.length === 0) {
                if (matchedTemplate && matchedTemplate.steps && matchedTemplate.steps.length > 0) {
                  order.route = matchedTemplate.steps.slice();
                  order.status = matchedTemplate.steps[0];
                } else {
                  order.route = statuses.slice();
                  order.status = statuses[0];
                }
              }

              if (!order.source) order.source = 'excel';

              await setDocument('work_orders', order.id, order);
              added++;
            }
          }
          
          // 💡 儲存新增的類別 (使用 updateDocument 避免覆蓋其他設定)
          if (newCategoriesAdded) {
            currentCategories.sort();
            await updateDocument('settings', 'main', { categories: currentCategories });
            settingsCategories = currentCategories;
            showToast('已自動新增未知的工單類別', 'info');
          }

          let msg = isAuto ? '自動同步完成！' : '匯入完成！';
          if (added > 0 || updated > 0 || diffCount > 0) {
            msg += ` 新增 ${added}，更新 ${updated}`;
            if (diffCount > 0) msg += `，比對不符 ${diffCount}`;
            showToast(msg, 'success');
          }
          
          resolve();
          
        } catch (error) {
          console.error('[Import Error]', error);
          if (!isAuto) showToast(`失敗: ${error.message}`, 'error');
          resolve();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-kanban', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/kanban.js
V: 1793071000
W: UPGRADE-007
*/