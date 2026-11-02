/**
 * 資料差異核對引擎（純函數，不碰 DOM、不碰 Firebase）
 * 職責：比對資料庫現有資料與 Excel 匯入的新資料，找出差異。
 */

/**
 * 將金額字串正規化（去除千分位逗號、空白，轉為數字）
 * 若無法轉換則回傳 null
 * @param {any} val 原始值
 * @returns {number|null}
 */
function normalizeAmount(val) {
  if (val === undefined || val === null || val === '') return null;
  
  // 移除逗號與空白
  const cleanStr = String(val).replace(/,/g, '').trim();
  if (cleanStr === '') return null;

  const num = Number(cleanStr);
  return isNaN(num) ? null : num;
}

/**
 * 比對單一工單的資料差異
 * @param {Object} dbOrder 資料庫現有工單資料
 * @param {Object} excelData Excel 匯入的工單資料 (通常是 formData 結構，即包含 data 物件)
 * @param {Array<string>} diffFields 要核對的欄位清單 (如 ['amount', 'quantity'])
 * @returns {Object|null} 若有差異，回傳差異物件；若無差異或無需比對，回傳 null
 */
export function checkDiff(dbOrder, excelData, diffFields = []) {
  // 如果沒有設定要核對的欄位，預設核對 amount
  const fieldsToCheck = diffFields.length > 0 ? diffFields : ['amount'];
  
  // 只針對手動輸入的工單進行差異標記保護 (Excel 來的就直接覆蓋了)
  if (dbOrder.source !== 'manual') {
    return null;
  }

  const diffs = {};

  fieldsToCheck.forEach(field => {
    // 取得兩邊的值 (可能是核心欄位或在 data 裡面)
    let dbVal = dbOrder[field];
    if (dbVal === undefined && dbOrder.data) {
      dbVal = dbOrder.data[field];
    }

    let excelVal = excelData[field];
    if (excelVal === undefined && excelData.data) {
      excelVal = excelData.data[field];
    }

    // 針對金額類欄位進行正規化比對
    if (field === 'amount' || field.includes('price') || field.includes('cost')) {
      const dbNum = normalizeAmount(dbVal);
      const excelNum = normalizeAmount(excelVal);

      // 若兩邊都有值，且不相等
      if (dbNum !== null && excelNum !== null && dbNum !== excelNum) {
        diffs[field] = {
          db: dbVal,
          excel: excelVal
        };
      }
    } else {
      // 一般文字欄位比對 (轉字串並去除前後空白)
      const dbStr = String(dbVal || '').trim();
      const excelStr = String(excelVal || '').trim();

      if (dbStr !== excelStr && excelStr !== '') {
        diffs[field] = {
          db: dbVal,
          excel: excelVal
        };
      }
    }
  });

  // 若找到差異，回傳差異物件
  if (Object.keys(diffs).length > 0) {
    return diffs;
  }

  return null;
}

/*
F: AI-WA-UPWO/src/domain/data-diff.js
V: 1792999000
W: UPGRADE-007
*/