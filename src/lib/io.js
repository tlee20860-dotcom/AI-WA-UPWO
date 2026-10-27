import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { groupByStatus } from '../domain/stats.js';

/**
 * 將工單資料匯出為 Excel 檔案 (依狀態分 Sheet，包含動態欄位)
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單
 * @param {string} filename 檔案名稱 (不含副檔名)
 * @param {Array} schema 系統欄位設定 (用於抓取自訂欄位)
 */
export function exportToExcel(orders, statuses, filename = '工單清單', schema = []) {
  if (!orders || orders.length === 0) {
    throw new Error('無資料可匯出');
  }

  const groupedData = groupByStatus(orders, statuses);
  const wb = XLSX.utils.book_new();

  // 過濾出非系統的自訂欄位
  const customFields = schema.filter(f => !f.isSystem);

  for (const status of statuses) {
    const statusOrders = groupedData[status] || [];
    if (statusOrders.length === 0) continue;

    // 整理要輸出的欄位
    const dataToExport = statusOrders.map(order => {
      // 基礎固定欄位
      const row = {
        '工單號碼': order.id,
        '類別': order.data?.category || '其他',
        '狀態': order.status,
        '銷售員': (order.salesReps || []).join(', '),
        '上傳日期': order.uploadDate || '',
        '狀態更新日': order.statusUpdateDate || '',
        '交貨日期': order.dueDate || ''
      };

      // 動態加入自訂欄位
      customFields.forEach(field => {
        row[field.label] = order.data && order.data[field.key] !== undefined ? order.data[field.key] : '';
      });

      return row;
    });

    // 建立工作表
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    // 將工作表加入活頁簿，並以狀態名稱命名（Excel sheet 名稱限制 31 字元）
    XLSX.utils.book_append_sheet(wb, ws, status.substring(0, 31));
  }

  // 觸發下載
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/**
 * 將工單資料匯出為 PDF 檔案 (依狀態分頁，包含動態欄位)
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

      // 如果有自訂欄位，可以在下方印出（避免版面太擠）
      const customFields = schema.filter(f => !f.isSystem);
      if (customFields.length > 0) {
        yPos += 5;
        const extraInfo = customFields.map(f => {
          const val = order.data && order.data[f.key] !== undefined ? order.data[f.key] : '-';
          return `${f.label}: ${val}`;
        }).join(' | ');
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(extraInfo.substring(0, 100), 14, yPos);
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

/* ═══ EOF ═══
F: AI-WA-UPWO/src/lib/io.js
V: 1792912500
W: UPGRADE-002
═══ */