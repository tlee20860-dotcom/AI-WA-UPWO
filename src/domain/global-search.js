/**
 * 全域搜尋引擎（純函數，不碰 DOM、不碰 Firebase）
 * 職責：跨工單所有欄位進行關鍵字搜尋，並支援進階條件過濾。
 */

/**
 * 將工單物件攤平為一維 key-value 物件，方便進行全欄位比對
 * @param {Object} order 工單物件
 * @returns {Object} 攤平後的物件
 */
function flattenOrder(order) {
  const flat = {};
  
  // 頂層屬性（排除物件型別與 materials 陣列，避免產生 [object Object] 汙染搜尋字串）
  Object.keys(order).forEach(key => {
    if (key !== 'data' && key !== 'diff' && key !== 'materials' && typeof order[key] !== 'object') {
      flat[key] = String(order[key] || '');
    }
  });

  // data 內的屬性
  if (order.data) {
    Object.keys(order.data).forEach(key => {
      flat[`data.${key}`] = String(order.data[key] || '');
    });
  }

  // 工單物料明細（materials 陣列）：將物料名稱與備註納入可搜尋範圍
  if (Array.isArray(order.materials)) {
    order.materials.forEach((mat, idx) => {
      if (mat && typeof mat === 'object') {
        if (mat.name !== undefined) flat[`materials.${idx}.name`] = String(mat.name || '');
        if (mat.note !== undefined) flat[`materials.${idx}.note`] = String(mat.note || '');
      }
    });
  }

  return flat;
}

/**
 * 執行搜尋與過濾
 * @param {Array<Object>} orders 所有工單陣列
 * @param {string} keyword 搜尋關鍵字
 * @param {Object} filters 進階篩選條件
 * @param {string} filters.status 狀態
 * @param {string} filters.category 類別
 * @param {string} filters.startDate 開始日期 (YYYY-MM-DD)
 * @param {string} filters.endDate 結束日期 (YYYY-MM-DD)
 * @returns {Array<Object>} 搜尋結果陣列（附帶 _highlights 標記命中欄位）
 */
export function searchOrders(orders, keyword = '', filters = {}) {
  let result = orders.filter(o => {
    const id = String(o.id || '');
    return id && !id.includes('***') && !id.includes('訂單');
  });

  // 1. 套用進階條件過濾
  if (filters.status) {
    result = result.filter(o => o.status === filters.status);
  }

  if (filters.category) {
    result = result.filter(o => {
      const cat = o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他';
      return cat.toUpperCase() === filters.category.toUpperCase();
    });
  }

  if (filters.startDate) {
    result = result.filter(o => {
      const dateStr = o.uploadDate || '';
      return dateStr >= filters.startDate;
    });
  }

  if (filters.endDate) {
    result = result.filter(o => {
      const dateStr = o.uploadDate || '';
      return dateStr <= filters.endDate;
    });
  }

  // 2. 套用關鍵字搜尋（若有輸入）
  const kw = keyword.trim().toLowerCase();
  if (kw) {
    result = result.filter(order => {
      const flat = flattenOrder(order);
      let matchedKeys = [];

      // 檢查每個欄位是否包含關鍵字
      Object.keys(flat).forEach(key => {
        if (flat[key].toLowerCase().includes(kw)) {
          matchedKeys.push(key);
        }
      });

      if (matchedKeys.length > 0) {
        // 將命中的欄位記錄在訂單物件上（供 UI 高亮使用）
        // 使用非標準屬性 _highlights 避免與資料庫欄位衝突
        order._highlights = matchedKeys;
        return true;
      }
      return false;
    });
  } else {
    // 若無關鍵字，清除舊的 highlight 標記
    result.forEach(order => { delete order._highlights; });
  }

  return result;
}

/*
F: AI-WA-UPWO/src/domain/global-search.js
V: 1793082000
W: UPGRADE-008
*/