/**
 * 公式引擎（純函數，不碰 DOM、不碰 Firebase）
 * 職責：根據系統設定的公式與表單輸入值，計算出目標欄位的結果。
 * 
 * 公式語法：使用 {{欄位Key}} 作為佔位符，例如 "{{quantity}} * {{price}}"。
 */

/**
 * 將公式字串轉換為可執行的 JS 表達式字串
 * @param {string} formula 原始公式字串
 * @param {Object} formData 表單輸入資料 (key-value)
 * @returns {string} 轉換後的 JS 表達式
 */
function parseFormula(formula, formData) {
  // 使用正規表達式尋找 {{...}} 佔位符
  return formula.replace(/\{\{([^}]+)\}\}/g, (match, fieldKey) => {
    const key = fieldKey.trim();
    const rawValue = formData[key];

    // 若值為空或未定義，視為 0 以利計算
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return '0';
    }

    // 嘗試轉為數字。若可轉換，直接插入數字；若不可轉換（如文字），則包裹引號
    const num = Number(rawValue);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }

    // 非數字的情況，作為字串字面量傳入（防範語法錯誤）
    // 使用 JSON.stringify 確保特殊字元（如引號）被安全轉義
    return JSON.stringify(rawValue);
  });
}

/**
 * 計算所有設定的公式
 * @param {Object} formulas 公式設定物件，格式為 { targetKey: "formula string" }
 * @param {Object} formData 表單輸入資料，格式為 { fieldKey: value }
 * @returns {Object} 計算結果物件，格式為 { targetKey: result }
 */
export function evaluate(formulas, formData) {
  const results = {};

  if (!formulas || typeof formulas !== 'object') {
    return results;
  }

  for (const [targetKey, formula] of Object.entries(formulas)) {
    if (!formula || typeof formula !== 'string') {
      continue;
    }

    // 若公式中沒有任何佔位符，則直接跳過（可能是無效的字串）
    if (!formula.includes('{{')) {
      continue;
    }

    try {
      // 1. 解析公式，替換佔位符為實際值
      const expression = parseFormula(formula, formData);

      // 2. 動態執行表達式（使用 Function 建構子，避免全域汙染）
      // 注意：此處存在理論上的 XSS 風險，但公式由管理員在設定頁輸入，且系統僅供內部使用，風險可控。
      // 若需最高安全性，應改寫為 AST 解析，但目前以輕量實作為主。
      const result = new Function(`return (${expression});`)();

      // 3. 處理結果型別
      if (typeof result === 'boolean') {
        // 布林值轉為「是/否」以便顯示
        results[targetKey] = result ? '是' : '否';
      } else if (typeof result === 'number') {
        // 數字去除浮點數誤差，最多保留兩位小數
        if (Number.isInteger(result)) {
          results[targetKey] = String(result);
        } else {
          results[targetKey] = result.toFixed(2);
        }
      } else {
        results[targetKey] = String(result);
      }
    } catch (err) {
      console.warn(`[Formula Engine] 公式計算失敗: ${targetKey} -> ${formula}`, err);
      results[targetKey] = '計算錯誤';
    }
  }

  return results;
}

/*
F: AI-WA-UPWO/src/domain/formula-engine.js
V: 1792991000
W: UPGRADE-007
*/