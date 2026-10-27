import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { groupByStatus } from '../domain/stats.js';

/**
 * 將工單資料匯出為 Excel 檔案 (依狀態分 Sheet)
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單
 * @param {string} filename 檔案名稱 (不含副檔名)
 */
export function exportToExcel(orders, statuses, filename = '工單清單') {
  if (!orders || orders.length === 0) {
    throw new Error('無資料可匯出');
  }

  const groupedData = groupByStatus(orders, statuses);
  const wb = XLSX.utils.book_new();

  for (const status of statuses) {
    const statusOrders = groupedData[status] || [];
    if (statusOrders.length === 0) continue;

    // 整理要輸出的欄位
    const dataToExport = statusOrders.map(order => ({
      '工單號碼': order.id,
      '狀態': order.status,
      '銷售員': (order.salesReps || []).join(', '),
      '上傳日期': order.uploadDate || '',
      '狀態更新日': order.statusUpdateDate || '',
      '交貨日期': order.dueDate || '',
      // 將 details 展開
      ...order.details
    }));

    // 建立工作表
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    // 將工作表加入活頁簿，並以狀態名稱命名（Excel sheet 名稱限制 31 字元）
    XLSX.utils.book_append_sheet(wb, ws, status.substring(0, 31));
  }

  // 觸發下載
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/**
 * 將工單資料匯出為 PDF 檔案 (依狀態分頁或分區塊)
 * @param {Array<Object>} orders 工單陣列
 * @param {Array<string>} statuses 狀態清單
 * @param {string} filename 檔案名稱 (不含副檔名)
 */
export function exportToPDF(orders, statuses, filename = '工單清單') {
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
    doc.text('銷售員', 60, yPos);
    doc.text('交貨日', 120, yPos);
    doc.text('上傳日', 160, yPos);
    
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
        doc.text('銷售員', 60, yPos);
        doc.text('交貨日', 120, yPos);
        doc.text('上傳日', 160, yPos);
        yPos += 5;
        doc.line(14, yPos, 196, yPos);
        yPos += 5;
      }

      const orderId = String(order.id).substring(0, 20);
      const salesRep = (order.salesReps || []).join(', ').substring(0, 20);
      const dueDate = String(order.dueDate || '').substring(0, 15);
      const uploadDate = String(order.uploadDate || '').split('T')[0];

      doc.text(orderId, 14, yPos);
      doc.text(salesRep, 60, yPos);
      doc.text(dueDate, 120, yPos);
      doc.text(uploadDate, 160, yPos);

      yPos += lineHeight;
    }
  }

  // 觸發下載
  doc.save(`${filename}_${new Date().toISOString().slice(0,10)}.pdf`);
}

/* ═══ EOF ═══
F: src/lib/io.js
V: 1792903507
W: webapp-20261026-001#19
═══ */