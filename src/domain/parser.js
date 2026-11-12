import * as XLSX from 'xlsx';

/**
 * 將銷售員字串依據對照表進行標準化
 * @param {string} repString 原始字串 (例如: "王小明 / 123")
 * @param {Array} salesMapping 對照表 (例如: [{ name: "王小明", aliases: ["123"] }])
 * @returns {Array<string>} 標準化後的銷售員名稱陣列
 */
export function normalizeSalesRep(repString, salesMapping) {
  if (!repString || String(repString).trim() === "") return ["未填寫"];
  
  // 依 "/" 分割並去除空白
  const rawNames = String(repString).split('/').map(s => s.trim()).filter(Boolean);
  if (rawNames.length === 0) return ["未填寫"];

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

    // 若無對應，則直接使用原名
    if (!matched) {
      resultSet.add(rawName);
    }
  }

  return Array.from(resultSet);
}

/**
 * 將 Excel 日期序列號轉換為 YYYY-MM-DD 格式
 * @param {any} val 原始數值或字串
 * @returns {string} 格式化後的日期字串
 */
function formatExcelDate(val) {
  if (val === undefined || val === null || val === '') return "";
  
  // 如果已經是正常的日期字串 (包含 - 或 /)
  if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
    if (val.includes('/')) {
      const parts = val.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }
    return val.trim();
  }

  // 處理 Excel 序列號 (通常介於 20000 到 80000 之間)
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    // Excel 起始日為 1899-12-30
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // 其他無法解析的，直接轉字串回傳
  return String(val).trim();
}

/**
 * 解析 Excel 匯入的資料列（自動偵測表頭 + 動態 Schema）
 * @param {Array<string>} headers Excel 第一列的標題 (可能不是真正的表頭)
 * @param {Array<Array<any>>} rows Excel 的資料列（不含第一列）
 * @param {Array} salesMapping 銷售員對照表
 * @param {string} defaultStatus 預設狀態 (如 "排產中")
 * @param {Array} schema 系統欄位定義
 * @param {string} targetMonth 指定過濾的月份 (格式 YYYY-MM，若為空則不篩選)
 * @returns {Array<Object>} 標準化後的工單物件陣列
 */
export function parseExcelData(headers, rows, salesMapping, defaultStatus = "排產中", schema = [], targetMonth = "") {
  const nowStr = new Date().toISOString();
  const parsedOrders = [];

  const allData = [headers, ...rows];

  // 1. 自動偵測表頭行數 (掃描前 20 行，尋找包含「單號」、「發票」、「工單號碼」、「登錄」的行)
  const idKeywords = ['單號', '發票', '工單號碼', '登錄'];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(allData.length, 20); i++) {
    const row = allData[i];
    if (!row) continue;
    const cleanRow = row.map(c => String(c || '').replace(/[\s\u3000]+/g, '').trim());
    if (cleanRow.some(cell => idKeywords.includes(cell))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return [];
  }

  const actualHeaders = allData[headerIdx];
  const dataRows = allData.slice(headerIdx + 1);

  // 2. 建立表頭索引映射：強制清洗表頭的空白、換行與全形空白
  const cleanStr = (s) => String(s || '').replace(/[\s\u3000]+/g, '').trim();
  const cleanHeaders = actualHeaders.map(cleanStr);

  const columnMap = {};
  schema.forEach(field => {
    const targetLabel = cleanStr(field.label);
    const idx = cleanHeaders.findIndex(h => h === targetLabel);
    if (idx !== -1) {
      columnMap[field.key] = idx;
    }
  });

  // 核心欄位別名映射表 (用於識別匯出的 Excel 或公司系統報表)
  const coreAliases = {
    id: ['工單號碼', '單號', '發票', 'id', '登錄'],
    status: ['狀態', '生產進度', 'status'],
    route: ['製程路線', '製程路線圖管理', 'route'],
    area: ['區域', 'area'],
    dueDate: ['交貨日期', '交貨日', '預計日期', 'dueDate'],
    uploadDate: ['上傳日期', '開單日期', '日期', 'uploadDate'],
    salesReps: ['銷售員', 'salesRep', 'salesReps', '我方備考', 'SALES編號', 'SALES'],
    source: ['來源', 'source'],
    supplierName: ['外發商', '工單類別/外發商', '供應商', '外發廠商'],
    category: ['類別', 'category', '工單類別']
  };

  // 找出核心欄位在 Excel 中的索引
  const coreIndices = {};
  Object.keys(coreAliases).forEach(key => {
    const aliases = coreAliases[key];
    const idx = cleanHeaders.findIndex(h => aliases.includes(h));
    if (idx !== -1) {
      coreIndices[key] = idx;
    }
  });

  let idIdx = coreIndices['id'];
  if (idIdx === undefined) {
    idIdx = columnMap['id'];
    if (idIdx !== undefined) coreIndices['id'] = idIdx;
  }

  if (idIdx === undefined) {
    return [];
  }

  // 3. 逐列解析
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;

    const rawIdVal = row[coreIndices['id']];
    const orderId = rawIdVal !== undefined && rawIdVal !== null ? String(rawIdVal).trim() : "";
    
    if (!orderId) {
      break;
    }

    // --- 解析核心欄位 ---
    
    // 上傳/開單日期 (uploadDate) - 先解析出來，因為要用來比對月份
    let uploadDate = nowStr.split('T')[0];
    if (coreIndices['uploadDate'] !== undefined && row[coreIndices['uploadDate']] !== undefined) {
      const formatted = formatExcelDate(row[coreIndices['uploadDate']]);
      if (formatted) uploadDate = formatted;
    }

    // 月份過濾防呆：若有指定月份，且開單日期不符合，則跳過該筆
    if (targetMonth && !uploadDate.startsWith(targetMonth)) {
      continue;
    }

    // 狀態 (status)
    let status = defaultStatus;
    if (coreIndices['status'] !== undefined && row[coreIndices['status']] !== undefined) {
      const val = String(row[coreIndices['status']]).trim();
      if (val) status = val;
    }

    // 製程路線 (route)
    let route = [];
    if (coreIndices['route'] !== undefined && row[coreIndices['route']] !== undefined) {
      const val = String(row[coreIndices['route']]).trim();
      if (val) {
        if (val.includes(',')) {
          route = val.split(',').map(s => s.trim()).filter(Boolean);
        } else if (val.includes('→')) {
          route = val.split('→').map(s => s.trim()).filter(Boolean);
        } else {
          route = [val];
        }
      }
    }

    // 區域 (area)
    let area = "";
    if (coreIndices['area'] !== undefined && row[coreIndices['area']] !== undefined) {
      const val = String(row[coreIndices['area']]).trim();
      if (val) area = val;
    }

    // 交貨日期 (dueDate)
    let dueDate = "";
    if (coreIndices['dueDate'] !== undefined && row[coreIndices['dueDate']] !== undefined) {
      dueDate = formatExcelDate(row[coreIndices['dueDate']]);
    }

    // 來源 (source)
    let source = "excel";
    if (coreIndices['source'] !== undefined && row[coreIndices['source']] !== undefined) {
      const val = String(row[coreIndices['source']]).trim();
      if (val === '手動' || val === 'manual') source = 'manual';
    }

    // 銷售員 (salesReps)
    let rawSalesRep = "";
    if (coreIndices['salesReps'] !== undefined && row[coreIndices['salesReps']] !== undefined) {
      rawSalesRep = String(row[coreIndices['salesReps']]);
    } else if (columnMap['salesRep'] !== undefined && row[columnMap['salesRep']] !== undefined) {
      rawSalesRep = String(row[columnMap['salesRep']]);
    }
    const normalizedReps = normalizeSalesRep(rawSalesRep, salesMapping);

    // 外發商 (supplierName)
    let supplierName = "";
    if (coreIndices['supplierName'] !== undefined && row[coreIndices['supplierName']] !== undefined) {
      supplierName = String(row[coreIndices['supplierName']]).trim();
    }

    // --- 收集動態欄位資料 ---
    const data = {};
    
    if (coreIndices['category'] !== undefined && row[coreIndices['category']] !== undefined) {
      const val = String(row[coreIndices['category']]).trim();
      if (val) {
        data['category'] = val.toUpperCase();
      }
    }
    
    if (!data['category']) {
      const categoryMatch = orderId.match(/^[a-zA-Z]+/);
      data['category'] = categoryMatch ? categoryMatch[0].toUpperCase() : '其他';
    }

    schema.forEach(field => {
      const isCoreHandled = ['id', 'status', 'route', 'area'].includes(field.key);
      if (!field.isSystem && !isCoreHandled && columnMap[field.key] !== undefined) {
        let val = row[columnMap[field.key]];
        
        // 💡 防呆：若該自訂欄位被定義為 date 類型，強制轉換為標準日期格式
        if (field.type === 'date' && val !== undefined && val !== null && val !== '') {
          val = formatExcelDate(val);
        }
        
        data[field.key] = val !== undefined && val !== null ? val : "";
      }
    });

    parsedOrders.push({
      id: orderId,
      status: status,
      route: route,
      area: area,
      salesReps: normalizedReps,
      supplierName: supplierName,
      uploadDate: uploadDate,
      statusUpdateDate: nowStr.split('T')[0],
      dueDate: dueDate,
      source: source,
      data: data
    });
  }

  return parsedOrders;
}

/**
 * 解析整份 Excel 活頁簿（支援指定分頁、多分頁合併與月份過濾）
 * @param {Object} workbook XLSX 的 workbook 物件
 * @param {Array<string>} targetSheetNames 指定要讀取的分頁名稱
 * @param {Array} salesMapping 銷售員對照表
 * @param {string} defaultStatus 預設狀態
 * @param {Array} schema 系統欄位定義
 * @param {string} targetMonth 指定過濾的月份 (格式 YYYY-MM)
 * @returns {Array<Object>} 合併後的工單物件陣列
 */
export function parseWorkbook(workbook, targetSheetNames = [], salesMapping, defaultStatus, schema, targetMonth = "") {
  const allParsedOrders = [];
  const sheetsToParse = targetSheetNames.length > 0 ? targetSheetNames : workbook.SheetNames;

  for (const sheetName of sheetsToParse) {
    if (!workbook.Sheets[sheetName]) continue;

    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (jsonData.length === 0) continue;

    const parsed = parseExcelData(
      jsonData[0], 
      jsonData.slice(1), 
      salesMapping, 
      defaultStatus, 
      schema,
      targetMonth
    );

    if (parsed.length > 0) {
      allParsedOrders.push(...parsed);
    }
  }

  // 去除重複單號
  const uniqueOrders = [];
  const seenIds = new Set();
  
  for (let i = allParsedOrders.length - 1; i >= 0; i--) {
    const order = allParsedOrders[i];
    if (!seenIds.has(order.id)) {
      seenIds.add(order.id);
      uniqueOrders.unshift(order);
    }
  }

  return uniqueOrders;
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/domain/parser.js
V: 1794188400
W: UPGRADE-009
═══ */