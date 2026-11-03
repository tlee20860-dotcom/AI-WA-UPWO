import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { groupByStatus } from '../domain/stats.js';

/**
 * 將工單資料匯出為 Excel 檔案
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單
 * @param {string} filename 檔案名稱 (不含副檔名)
 * @param {Array} schema 系統欄位設定
 * @param {Array<string>} exportConfig 自訂匯出欄位 (若為 null 或空，則使用預設)
 */
export function exportToExcel(orders, statuses, filename = '工單清單', schema = [], exportConfig = null) {
  if (!orders || orders.length === 0) {
    throw new Error('無資料可匯出');
  }

  const wb = XLSX.utils.book_new();
  const groupedData = groupByStatus(orders, statuses);

  // 輔助函數：將 route 陣列轉為字串
  const formatRoute = (routeArr) => {
    if (Array.isArray(routeArr) && routeArr.length > 0) {
      return routeArr.join(' → ');
    }
    return '';
  };

  // 輔助函數：取得所有資料庫中出現的動態欄位 Key (用於「全部工單」)
  const getAllDataKeys = () => {
    const keys = new Set();
    orders.forEach(o => {
      if (o.data) {
        Object.keys(o.data).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  };
  const allDataKeys = getAllDataKeys();

  // ── 1. 建立「全部工單」Sheet (全欄位) ──
  const allDataToExport = orders.map(order => {
    const row = {
      '工單號碼': order.id,
      '狀態': order.status,
      '製程路線': formatRoute(order.route),
      '銷售員': (order.salesReps || []).join(', '),
      '開單日期': order.uploadDate || '',
      '交貨日期': order.dueDate || '',
      '狀態更新日': order.statusUpdateDate || '',
      '來源': order.source === 'manual' ? '手動' : 'Excel',
      '核對狀態': order.diff ? '有差異' : '正常'
    };

    // 加入 Schema 定義的欄位 (包含關聯欄位)
    schema.forEach(field => {
      if (!field.isSystem) {
        row[field.label] = order.data && order.data[field.key] !== undefined ? order.data[field.key] : '';
      }
    });

    // 加入 Schema 未定義但在資料中存在的欄位
    allDataKeys.forEach(key => {
      const schemaField = schema.find(f => f.key === key);
      if (!schemaField && key !== 'category') {
        row[key] = order.data && order.data[key] !== undefined ? order.data[key] : '';
      }
    });

    // 向下相容舊資料的 supplierName (若有在根目錄)
    if (order.supplierName && !row['外發供應商']) {
      row['外發供應商'] = order.supplierName;
    }

    return row;
  });

  const wsAll = XLSX.utils.json_to_sheet(allDataToExport);
  XLSX.utils.book_append_sheet(wb, wsAll, '全部工單');

  // ── 2. 建立「分狀態」Sheets (依自訂欄位) ──
  // 決定要輸出的欄位 (若無設定則 Fallback 到預設)
  let targetFields = [];
  if (exportConfig && exportConfig.length > 0) {
    targetFields = exportConfig.map(key => schema.find(f => f.key === key)).filter(Boolean);
  } else {
    // 預設欄位
    targetFields = [
      { key: 'id', label: '工單號碼' },
      { key: 'status', label: '狀態' },
      { key: 'salesReps', label: '銷售員' },
      { key: 'uploadDate', label: '開單日期' },
      { key: 'dueDate', label: '交貨日期' }
    ];
    // 加入所有自訂欄位
    schema.filter(f => !f.isSystem).forEach(f => targetFields.push(f));
  }

  for (const status of statuses) {
    const statusOrders = groupedData[status] || [];
    if (statusOrders.length === 0) continue;

    const dataToExport = statusOrders.map(order => {
      const row = {};
      
      targetFields.forEach(f => {
        if (f.key === 'id') {
          row['工單號碼'] = order.id;
        } else if (f.key === 'status') {
          row['狀態'] = order.status;
        } else if (f.key === 'salesReps') {
          row['銷售員'] = (order.salesReps || []).join(', ');
        } else if (f.key === 'uploadDate') {
          row['開單日期'] = order.uploadDate || '';
        } else if (f.key === 'dueDate') {
          row['交貨日期'] = order.dueDate || '';
        } else if (f.key === 'route') {
          row['製程路線'] = formatRoute(order.route);
        } else if (f.isSystem) {
          row[f.label] = order[f.key] || '';
        } else {
          row[f.label] = order.data && order.data[f.key] !== undefined ? order.data[f.key] : '';
        }
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, ws, status.substring(0, 31));
  }

  // 觸發下載
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/**
 * 將工單資料匯出為 PDF 檔案 (依狀態分頁)
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單
 * @param {string} filename 檔案名稱 (不含副檔名)
 * @param {Array} schema 系統欄位設定
 */
export function exportToPDF(orders, statuses, filename = '工單清單', schema = []) {
  if (!orders || orders.length === 0) {
    throw new Error('無資料可匯出');
  }

  const doc = new jsPDF();
  const groupedData = groupByStatus(orders, statuses);
  
  let isFirstPage = true;

  for (const status of statuses) {
    const statusOrders = groupedData[status] || [];
    if (statusOrders.length === 0) continue;

    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    // 標題
    doc.setFontSize(16);
    doc.text(`工序狀態：${status}`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);

    let yPos = 30;
    const lineHeight = 10;
    const pageHeight = doc.internal.pageSize.height;

    // 表頭
    doc.text('工單號碼', 14, yPos);
    doc.text('類別', 50, yPos);
    doc.text('銷售員', 70, yPos);
    doc.text('交貨日', 120, yPos);
    
    yPos += 5;
    doc.setLineWidth(0.5);
    doc.line(14, yPos, 196, yPos);
    yPos += 5;

    // 內容
    doc.setTextColor(0);
    for (const order of statusOrders) {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
        // 重新繪製表頭
        doc.text('工單號碼', 14, yPos);
        doc.text('類別', 50, yPos);
        doc.text('銷售員', 70, yPos);
        doc.text('交貨日', 120, yPos);
        yPos += 5;
        doc.line(14, yPos, 196, yPos);
        yPos += 5;
      }

      const orderId = String(order.id).substring(0, 20);
      const cat = String(order.data?.category || '其他').substring(0, 10);
      const salesRep = (order.salesReps || []).join(', ').substring(0, 25);
      const dueDate = String(order.dueDate || '-').substring(0, 15);

      doc.text(orderId, 14, yPos);
      doc.text(cat, 50, yPos);
      doc.text(salesRep, 70, yPos);
      doc.text(dueDate, 120, yPos);

      // 組合額外資訊（包含自訂欄位）
      let extraInfoArr = [];
      const customFields = schema.filter(f => !f.isSystem);
      
      customFields.forEach(f => {
        const val = order.data && order.data[f.key] !== undefined ? order.data[f.key] : '-';
        if (val) {
          extraInfoArr.push(`${f.label}: ${val}`);
        }
      });

      if (extraInfoArr.length > 0) {
        yPos += 5;
        const extraInfo = extraInfoArr.join(' | ');
        doc.setFontSize(8);
        doc.setTextColor(100);
        // 限制字數避免超出邊界
        doc.text(extraInfo.substring(0, 120), 14, yPos);
        doc.setFontSize(10);
        doc.setTextColor(0);
        yPos += 5; // 多佔用一行
      }

      yPos += lineHeight;
    }
  }

  // 觸發下載
  doc.save(`${filename}_${new Date().toISOString().slice(0,10)}.pdf`);
}

/*
F: AI-WA-UPWO/src/lib/io.js
V: 1793086000
W: UPGRADE-007
*/