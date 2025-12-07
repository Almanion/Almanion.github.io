// ============================================
// GOOGLE APPS SCRIPT для МатЦентра
// ============================================

// Этот скрипт нужно разместить в Google Apps Script
// Инструкция по установке в файле MATCENTER_SETUP.md

function doGet(e) {
  // ID вашей таблицы
  const SPREADSHEET_ID = '1K7Phvgrzu_RyzoCGiVMZOq3PQK2VxXQA6OJV6kgs1Ug';
  
  try {
    // Открываем таблицу
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets()[0]; // Первый лист
    
    // Получаем все данные
    const data = sheet.getDataRange().getValues();
    
    // Пропускаем заголовок (первая строка)
    const tasks = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Столбцы: A - Номер, B - Статус, C - Текст задачи
      const number = row[0] ? String(row[0]).trim() : '';
      const status = row[1] ? String(row[1]).trim() : '';
      const description = row[2] ? String(row[2]).trim() : '';
      
      // Пропускаем пустые строки
      if (!number || !status) continue;
      
      // Пропускаем заголовки
      if (number.toLowerCase() === 'номер' || status.toLowerCase() === 'статус') continue;
      
      tasks.push({
        number: number,
        status: status,
        description: description
      });
    }
    
    // Возвращаем JSON
    const output = JSON.stringify({
      success: true,
      count: tasks.length,
      tasks: tasks,
      timestamp: new Date().toISOString()
    });
    
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // В случае ошибки
    const output = JSON.stringify({
      success: false,
      error: error.toString()
    });
    
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

