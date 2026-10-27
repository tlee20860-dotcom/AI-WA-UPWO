/**
 * 將工單陣列依「狀態」分組
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} allStatuses 所有可能的狀態清單（確保空狀態也有空陣列）
 * @returns {Object} 以狀態為 key 的物件，value 為該狀態的工單陣列
 */
export function groupByStatus(orders, allStatuses = []) {
  const grouped = {};
  
  // 先初始化所有狀態為空陣列
  allStatuses.forEach(status => {
    grouped[status] = [];
  });

  // 遍歷工單進行分組
  orders.forEach(order => {
    const status = order.status || '未知狀態';
    if (!grouped[status]) {
      grouped[status] = [];
    }
    grouped[status].push(order);
  });

  return grouped;
}

/**
 * 將工單陣列依「銷售員」分組
 * @param {Array<Object>} orders 工單陣列
 * @returns {Object} 以銷售員為 key 的物件，value 為該銷售員的工單陣列
 */
export function groupBySalesRep(orders) {
  const grouped = {};

  orders.forEach(order => {
    const reps = order.salesReps || ['未填寫'];
    reps.forEach(rep => {
      if (!grouped[rep]) {
        grouped[rep] = [];
      }
      grouped[rep].push(order);
    });
  });

  return grouped;
}

/**
 * 將工單陣列依「類別 (發票前兩碼)」分組
 * @param {Array<Object>} orders 工單陣列
 * @returns {Object} 以類別為 key 的物件，value 為該類別的工單陣列
 */
export function groupByCategory(orders) {
  const grouped = {};

  orders.forEach(order => {
    // 優先從 data.category 抓取，若無則嘗試從 id 擷取
    let category = order.data && order.data['category'];
    
    if (!category) {
      const match = String(order.id).match(/^[a-zA-Z]+/);
      category = match ? match[0].toUpperCase() : '其他';
    }

    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(order);
  });

  return grouped;
}

/**
 * 計算總體統計數據（用於 Overview 視圖或 Stats 卡片）
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} allStatuses 所有狀態清單
 * @returns {Object} 包含總數與各狀態數量的物件
 */
export function calculateStats(orders, allStatuses = []) {
  const stats = {
    total: orders.length,
    byStatus: {}
  };

  allStatuses.forEach(status => {
    stats.byStatus[status] = 0;
  });

  orders.forEach(order => {
    const status = order.status || '未知狀態';
    if (!stats.byStatus[status]) {
      stats.byStatus[status] = 0;
    }
    stats.byStatus[status]++;
  });

  return stats;
}

/**
 * 生成樞紐交叉表資料（用於 Overview 視圖上半部）
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單（列）
 * @param {Array<string>} salesReps 銷售員清單（欄）
 * @returns {Object} 包含表頭與二維資料的物件
 */
export function generatePivotTable(orders, statuses = [], salesReps = []) {
  // 建立二維陣列結構
  const matrix = {};
  
  // 初始化矩陣
  statuses.forEach(status => {
    matrix[status] = {};
    salesReps.forEach(rep => {
      matrix[status][rep] = 0;
    });
  });

  // 填充數據
  orders.forEach(order => {
    const status = order.status || '未知狀態';
    const reps = order.salesReps || ['未填寫'];
    
    reps.forEach(rep => {
      // 如果該銷售員不在表頭清單中，動態加入
      if (!matrix[status]) {
        matrix[status] = {};
      }
      if (matrix[status][rep] === undefined) {
        matrix[status][rep] = 0;
      }
      matrix[status][rep]++;
    });
  });

  return matrix;
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/domain/stats.js
V: 1792911600
W: UPGRADE-002
═══ */