import * as XLSX from 'xlsx';

/**
 * 將網頁的工單狀態寫回 Excel 活頁簿
 * @param {Object} workbook XLSX 的 workbook 物件
 * @param {Array<string>} targetSheetNames 目標分頁名稱陣列
 * @param {Array<Object>} orders 要更新的工單資料陣列
 * @returns {Object} 更新後的 workbook 物件
 */
export function updateWorkbookState(workbook, targetSheetNames, orders) {
  const sheetsToUpdate = targetSheetNames.length > 0 ? targetSheetNames : workbook.SheetNames;
  
  // 建立單號對應的資料字典，方便快速查詢
  const orderMap = {};
  orders.forEach(o => {
    if (o.id) orderMap[String(o.id).trim()] = o;
  });

  const idKeywords = ['單號', '發票', '工單號碼', '登錄'];
  const cleanStr = (s) => String(s || '').replace(/[\s\u3000]+/g, '').trim();

  for (const sheetName of sheetsToUpdate) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // 將分頁轉為二維陣列以尋找表頭與資料列
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (jsonData.length === 0) continue;

    // 1. 尋找表頭行
    let headerIdx = -1;
    for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
      const row = jsonData[i];
      if (!row) continue;
      const cleanRow = row.map(cleanStr);
      if (cleanRow.some(cell => idKeywords.includes(cell))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) continue; // 找不到表頭，跳過此分頁

    const headers = jsonData[headerIdx];
    const cleanHeaders = headers.map(cleanStr);

    // 2. 定位核心欄位索引
    let idColIdx = cleanHeaders.findIndex(h => idKeywords.includes(h));
    if (idColIdx === -1) continue;

    let statusColIdx = cleanHeaders.findIndex(h => ['狀態', '生產進度', 'status'].includes(h));
    let routeColIdx = cleanHeaders.findIndex(h => ['製程路線', '製程路線圖管理', 'route'].includes(h));
    let areaColIdx = cleanHeaders.findIndex(h => ['區域', 'area'].includes(h));

    // 3. 若無狀態欄位，則在最後一欄新增
    let newColCount = headers.length;
    if (statusColIdx === -1) {
      statusColIdx = newColCount++;
      XLSX.utils.sheet_add_aoa(sheet, [['狀態']], { origin: { r: headerIdx, c: statusColIdx } });
    }
    if (routeColIdx === -1) {
      routeColIdx = newColCount++;
      XLSX.utils.sheet_add_aoa(sheet, [['製程路線']], { origin: { r: headerIdx, c: routeColIdx } });
    }
    if (areaColIdx === -1) {
      areaColIdx = newColCount++;
      XLSX.utils.sheet_add_aoa(sheet, [['區域']], { origin: { r: headerIdx, c: areaColIdx } });
    }

    // 4. 逐列更新資料
    for (let r = headerIdx + 1; r < jsonData.length; r++) {
      const row = jsonData[r];
      if (!row) continue;

      const rawId = row[idColIdx];
      const orderId = rawId !== undefined && rawId !== null ? String(rawId).trim() : "";
      
      if (!orderId) break; // 遇到空白單號，停止該分頁

      const orderData = orderMap[orderId];
      if (orderData) {
        // 寫入狀態
        if (orderData.status !== undefined) {
          XLSX.utils.sheet_add_aoa(sheet, [[orderData.status]], { origin: { r: r, c: statusColIdx } });
        }
        // 寫入製程路線 (轉為字串)
        if (orderData.route !== undefined) {
          const routeStr = Array.isArray(orderData.route) ? orderData.route.join(' → ') : String(orderData.route || '');
          XLSX.utils.sheet_add_aoa(sheet, [[routeStr]], { origin: { r: r, c: routeColIdx } });
        }
        // 寫入區域
        if (orderData.area !== undefined) {
          XLSX.utils.sheet_add_aoa(sheet, [[orderData.area]], { origin: { r: r, c: areaColIdx } });
        }
      }
    }
  }

  return workbook;
}

/**
 * 將更新後的 workbook 觸發下載
 * @param {Object} workbook 更新後的 workbook 物件
 * @param {string} fileName 下載的檔案名稱 (例如：2026 開單紀錄_已同步.xlsx)
 */
export function downloadWorkbook(workbook, fileName) {
  try {
    // 使用 XLSX 的 writeFile 直接觸發瀏覽器下載
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
    return true;
  } catch (error) {
    console.error('[Excel Download Error]', error);
    throw error;
  }
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/domain/excel-writer.js
V: 1794186800
W: UPGRADE-009
═══ */