/**
 * 將銷售員字串依據對照表進行標準化
 * @param {string} repString 原始字串 (例如: "王小明 / 123")
 * @param {Array} salesMapping 對照表 (例如: [{ name: "王小明", aliases: ["123"] }])
 * @returns {Array<string>} 標準化後的銷售員名稱陣列
 */
export function normalizeSalesRep(repString, salesMapping) {
  if (!repString) return ["未知銷售員"];
  
  // 依 "/" 分割並去除空白
  const rawNames = repString.split('/').map(s => s.trim()).filter(Boolean);
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

    // 若無對應，則歸為未知
    if (!matched) {
      resultSet.add("未知銷售員");
    }
  }

  return Array.from(resultSet);
}

/**
 * 解析 Excel 匯入的資料列
 * @param {Array<string>} headers Excel 第一列的標題
 * @param {Array<Array<any>>} rows Excel 的資料列（不含標題）
 * @param {Array} salesMapping 銷售員對照表
 * @param {string} defaultStatus 預設狀態 (如 "排產中")
 * @returns {Array<Object>} 標準化後的工單物件陣列
 */
export function parseExcelData(headers, rows, salesMapping, defaultStatus = "排產中") {
  const nowStr = new Date().toISOString();
  const parsedOrders = [];

  // 建立表頭索引映射，方便尋找交貨日等欄位
  // 假設 Excel 欄位：A(0) 工單、B(1) 客戶、C(2) 品名、D(3) 數量、E(4) 單價、F(5) 金額、G(6) 銷售員、H(7) 交貨日
  // 這裡我們不寫死交貨日是哪一欄，而是讓 AI 或使用者自己決定，但預設我們可以找包含「交期」或「交貨」的欄位。
  const dueDateIndex = headers.findIndex(h => h && (h.includes('交期') || h.includes('交貨')));
  const salesRepIndex = 6; // 依據需求，G 欄固定為銷售員 (索引 6)
  const orderIdIndex = 0;  // 依據需求，A 欄固定為工單號 (索引 0)

  for (const row of rows) {
    // 跳過空行
    if (!row || row.length === 0) continue;

    const orderId = String(row[orderIdIndex] || '').trim();
    
    // 跳過沒有工單號的行
    if (!orderId) continue;

    // 解析銷售員
    const rawSalesRep = row[salesRepIndex] ? String(row[salesRepIndex]) : "";
    const normalizedReps = normalizeSalesRep(rawSalesRep, salesMapping);

    // 解析交貨日 (如果有找到對應欄位且該格有值)
    let dueDate = "";
    if (dueDateIndex !== -1 && row[dueDateIndex]) {
      // 如果是 Excel 日期序列號，可以在此轉換，或交給上層處理
      dueDate = String(row[dueDateIndex]).trim();
    }

    // 將其他欄位存入 details
    const details = {};
    headers.forEach((header, index) => {
      // 排除 A 欄(工單號) 與 G 欄(銷售員)，避免重複
      if (index !== orderIdIndex && index !== salesRepIndex && header) {
        details[header] = row[index] !== undefined ? row[index] : "";
      }
    });

    parsedOrders.push({
      id: orderId,
      status: defaultStatus,
      salesReps: normalizedReps,
      uploadDate: nowStr,
      statusUpdateDate: nowStr,
      dueDate: dueDate,
      details: details
    });
  }

  return parsedOrders;
}

/* ═══ EOF ═══
F: src/domain/parser.js
V: 1792903505
W: webapp-20261026-001#17
═══ */