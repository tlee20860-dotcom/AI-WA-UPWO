/**
 * 將銷售員字串依據對照表進行標準化
 * @param {string} repString 原始字串 (例如: "王小明 / 123")
 * @param {Array} salesMapping 對照表 (例如: [{ name: "王小明", aliases: ["123"] }])
 * @returns {Array<string>} 標準化後的銷售員名稱陣列
 */
export function normalizeSalesRep(repString, salesMapping) {
  if (!repString) return ["未知銷售員"];
  
  // 依 "/" 分割並去除空白
  const rawNames = String(repString).split('/').map(s => s.trim()).filter(Boolean);
  if (rawNames.length === 0) return ["未知銷售員"];

  const resultSet = new Set();

  for (const rawName of rawNames) {
    let matched = false;
    
    // 尋找對照表中符合的 name 或 aliases
    for (const mapItem of salesMapping) {
      const isNameMatch = mapItem.name === rawName;
      const isAliasMatch = mapItem.aliases && mapItem.aliases.includes(rawName);
      
      if (isNameMatch || isAliasMatch) {
        resultSet.add(mapItem.name);
        matched = true;
        break;
      }
    }

    // 若無對應，則直接使用原名（或歸為未知，視業務需求。這裡保留原名以免遺失資訊）
    if (!matched) {
      resultSet.add(rawName);
    }
  }

  return Array.from(resultSet);
}

/**
 * 解析 Excel 匯入的資料列（動態 Schema 版）
 * @param {Array<string>} headers Excel 第一列的標題
 * @param {Array<Array<any>>} rows Excel 的資料列（不含標題）
 * @param {Array} salesMapping 銷售員對照表
 * @param {string} defaultStatus 預設狀態 (如 "排產中")
 * @param {Array} schema 系統欄位定義
 * @returns {Array<Object>} 標準化後的工單物件陣列
 */
export function parseExcelData(headers, rows, salesMapping, defaultStatus = "排產中", schema = []) {
  const nowStr = new Date().toISOString();
  const parsedOrders = [];

  // 1. 建立表頭索引映射：根據 schema 的 label 去尋找 Excel 對應的欄位索引
  const columnMap = {};
  schema.forEach(field => {
    const idx = headers.findIndex(h => h && String(h).trim() === field.label.trim());
    if (idx !== -1) {
      columnMap[field.key] = idx;
    }
  });

  // 2. 檢查必要的系統核心欄位是否存在
  if (columnMap['id'] === undefined) {
    throw new Error('找不到「工單號碼 (發票)」欄位，請確認 Excel 表頭或欄位設定。');
  }

  // 3. 逐列解析
  for (const row of rows) {
    // 跳過空行
    if (!row || row.length === 0) continue;

    const orderId = String(row[columnMap['id']] || '').trim();
    
    // 跳過沒有工單號的行
    if (!orderId) continue;

    // 解析日期 (若無對應欄位則給予目前時間)
    let uploadDate = nowStr;
    if (columnMap['uploadDate'] !== undefined && row[columnMap['uploadDate']]) {
      // 這裡簡化處理，保留原始字串或轉 ISO
      uploadDate = String(row[columnMap['uploadDate']]).trim();
    }

    // 解析銷售員
    let rawSalesRep = "";
    if (columnMap['salesRep'] !== undefined && row[columnMap['salesRep']]) {
      rawSalesRep = String(row[columnMap['salesRep']]);
    }
    const normalizedReps = normalizeSalesRep(rawSalesRep, salesMapping);

    // 收集動態欄位資料 (非系統核心欄位)
    const data = {};
    schema.forEach(field => {
      // 排除系統核心欄位 (id, uploadDate, salesRep 等)
      if (!field.isSystem && columnMap[field.key] !== undefined) {
        const val = row[columnMap[field.key]];
        data[field.key] = val !== undefined && val !== null ? val : "";
      }
    });

    parsedOrders.push({
      id: orderId,
      status: defaultStatus,
      salesReps: normalizedReps,
      uploadDate: uploadDate,
      statusUpdateDate: nowStr,
      dueDate: "", // 交期依需求為匯入後手動輸入
      data: data   // 動態欄位資料
    });
  }

  return parsedOrders;
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/domain/parser.js
V: 1792910900
W: UPGRADE-002
═══ */