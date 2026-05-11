// ============================================
// GOOGLE APPS SCRIPT для МатЦентра
// ============================================

// Этот скрипт нужно разместить в Google Apps Script
// Инструкция по установке в файле MATCENTER_SETUP.md

// Обработка POST запросов (основной метод)
function doPost(e) {
  return handleRequest(e, true);
}

// Обработка GET запросов (для обратной совместимости)
function doGet(e) {
  return handleRequest(e, false);
}

// Вспомогательная функция для создания JSON ответа
// CORS заголовки добавляются автоматически Google Apps Script
function createJsonResponse(jsonString) {
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e, isPost) {
  // ========================================
  // НАСТРОЙКИ (ИЗМЕНИТЕ ЭТИ ЗНАЧЕНИЯ!)
  // ========================================
  
  // 🔐 УСТАНОВИТЕ СВОИ ПАРОЛИ ЗДЕСЬ:
  const CORRECT_PASSWORD = 'KyC54h2yqj';  // Обычный пользовательский пароль
  const ADMIN_PASSWORD = 'adminKyC54h2yqj';  // Админский пароль
  
  // 📊 ID вашей таблицы
  const SPREADSHEET_ID = '1K7Phvgrzu_RyzoCGiVMZOq3PQK2VxXQA6OJV6kgs1Ug';
  
  // ========================================
  // ПОЛУЧЕНИЕ ПАРАМЕТРОВ (универсально)
  // ========================================
  
  let providedPassword = '';
  let clientId = 'unknown';
  
  // Пробуем получить из POST данных
  if (isPost && e.postData && e.postData.contents) {
    try {
      const data = JSON.parse(e.postData.contents);
      providedPassword = data.password || '';
      clientId = data.clientId || 'unknown';
      Logger.log('POST data parsed successfully');
    } catch (err) {
      Logger.log('Error parsing POST data: ' + err);
      Logger.log('POST data contents: ' + e.postData.contents);
    }
  }
  
  // Если не получилось из POST, пробуем из GET параметров
  if (!providedPassword && e.parameter) {
    providedPassword = e.parameter.password || '';
    clientId = e.parameter.clientId || 'unknown';
    Logger.log('Using GET parameters');
  }
  
  Logger.log('Request details: method=' + (isPost ? 'POST' : 'GET') + 
             ', clientId=' + clientId + 
             ', hasPassword=' + (providedPassword ? 'yes' : 'no'));
  
  // ========================================
  // RATE LIMITING (защита от brute-force)
  // ========================================
  
  const cache = CacheService.getScriptCache();
  const rateLimitKey = 'rate_limit_' + clientId;
  const MAX_ATTEMPTS = 10;
  const WINDOW_SECONDS = 900; // 15 минут
  
  // Проверяем лимит попыток
  const attempts = parseInt(cache.get(rateLimitKey) || '0');
  
  if (attempts >= MAX_ATTEMPTS) {
    Logger.log(`Rate limit exceeded for ${clientId}`);
    return createJsonResponse(JSON.stringify({
      success: false,
      error: 'Слишком много попыток. Попробуйте через 15 минут.'
    }));
  }
  
  // ========================================
  // ПРОВЕРКА ПАРОЛЯ
  // ========================================
  
  // Проверяем, является ли это админским паролем
  let isAdmin = false;
  let isValidPassword = false;
  
  if (providedPassword === ADMIN_PASSWORD) {
    isAdmin = true;
    isValidPassword = true;
  } else if (providedPassword === CORRECT_PASSWORD) {
    isAdmin = false;
    isValidPassword = true;
  }
  
  if (!isValidPassword) {
    // Увеличиваем счётчик неудачных попыток
    cache.put(rateLimitKey, (attempts + 1).toString(), WINDOW_SECONDS);
    
    // Логируем неудачную попытку
    Logger.log(`Failed auth attempt from ${clientId} at ${new Date().toISOString()}`);
    
    const output = JSON.stringify({
      success: false,
      error: 'Неверный пароль'
    });
    
    return createJsonResponse(output);
  }
  
  // Сбрасываем счётчик при успешной авторизации
  cache.remove(rateLimitKey);
  Logger.log(`Successful auth from ${clientId} at ${new Date().toISOString()} (admin: ${isAdmin})`);
  
  // ================== ОБРАБОТКА ЗАПИСИ ПОДСКАЗКИ ====================
  // Проверяем action из GET или POST параметров
  let action = '';
  let taskNumber = '';
  let hintText = '';
  let newStatus = '';
  
  if (isPost && e.postData && e.postData.contents) {
    try {
      const payload = JSON.parse(e.postData.contents);
      action = payload.action || '';
      taskNumber = String(payload.taskNumber || '').trim();
      hintText = payload.hintText || '';
      newStatus = payload.newStatus || '';
      Logger.log('📦 POST Payload: ' + JSON.stringify(payload));
    } catch(err) {
      Logger.log('❌ POST parse error: ' + err);
    }
  } else if (e.parameter) {
    action = e.parameter.action || '';
    taskNumber = String(e.parameter.taskNumber || '').trim();
    hintText = e.parameter.hintText || '';
    newStatus = String(e.parameter.newStatus || '').trim();
    Logger.log('📦 GET Parameters: action=' + action + ', taskNumber=' + taskNumber + ', newStatus=' + newStatus);
  }
  
  if (isAdmin && action === 'setHint') {
    try {
      Logger.log(`🔍 Попытка setHint: taskNumber="${taskNumber}", hintText length=${hintText.length}`);
      
      if (taskNumber) {
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = spreadsheet.getSheets()[0];
        const hintsStartRow = 3000;
        
        // Читаем диапазон подсказок (строки 3000+)
        const lastRow = sheet.getLastRow();
        let hintsData = [];
        
        if (lastRow >= hintsStartRow) {
          // Таблица имеет строки >= 3000, читаем их
          hintsData = sheet.getRange(hintsStartRow, 1, lastRow - hintsStartRow + 1, 2).getValues();
        } else {
          // Таблица меньше 3000 строк - подсказок пока нет, создадим пустой массив
          Logger.log(`⚠️ Таблица меньше ${hintsStartRow} строк (lastRow=${lastRow}), подсказок нет`);
        }
        
        let found = false;
        let targetRow = -1;
        
        // Ищем существующую подсказку для этой задачи
        for (let i = 0; i < hintsData.length; i++) {
          const rowNumber = String(hintsData[i][0] || '').trim();
          if (rowNumber === taskNumber) {
            targetRow = hintsStartRow + i;
            found = true;
            Logger.log(`  Найдена подсказка в строке ${targetRow}`);
            break;
          }
        }
        
        if (hintText && hintText.trim()) {
          // Если текст подсказки не пустой - записываем/обновляем
          if (found) {
            // Обновляем существующую
            sheet.getRange(targetRow, 1, 1, 2).setValues([[taskNumber, hintText]]);
            Logger.log(`✅ Подсказка обновлена в строке ${targetRow}`);
          } else {
            // Ищем первую пустую строку в диапазоне 3000+
            let emptyRow = -1;
            for (let i = 0; i < hintsData.length; i++) {
              if (!hintsData[i][0] && !hintsData[i][1]) {
                emptyRow = hintsStartRow + i;
                break;
              }
            }
            // Если не нашли пустую - добавляем в конец
            if (emptyRow === -1) {
              emptyRow = hintsStartRow + hintsData.length;
            }
            sheet.getRange(emptyRow, 1, 1, 2).setValues([[taskNumber, hintText]]);
            Logger.log(`✅ Новая подсказка добавлена в строку ${emptyRow}`);
          }
          return createJsonResponse(JSON.stringify({success:true, updated:true}));
        } else {
          // Если текст пустой - удаляем подсказку
          if (found) {
            sheet.getRange(targetRow, 1, 1, 2).clearContent();
            Logger.log(`✅ Подсказка удалена из строки ${targetRow}`);
            return createJsonResponse(JSON.stringify({success:true, deleted:true}));
          } else {
            Logger.log(`⚠️ Подсказка для задачи №${taskNumber} не найдена`);
            return createJsonResponse(JSON.stringify({success:true, message:'Подсказка не существует'}));
          }
        }
      } else {
        Logger.log('❌ taskNumber пустой');
        return createJsonResponse(JSON.stringify({success:false, error:'taskNumber не указан'}));
      }
    } catch(err) { 
      Logger.log('❌ setHint error: ' + err);
      return createJsonResponse(JSON.stringify({success:false, error:err.toString()}));
    }
  }
// ================== КОНЕЦ setHint ====================
  
  // ================== ОБРАБОТКА ИЗМЕНЕНИЯ СТАТУСА ====================
  if (isAdmin && action === 'changeStatus') {
    try {
      Logger.log(`🔍 Попытка changeStatus: taskNumber="${taskNumber}", newStatus="${newStatus}"`);
      
      if (taskNumber && newStatus) {
        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = spreadsheet.getSheets()[0];
        
        const COL_NUMBER = 1;
        const COL_STATUS = 2;
        const hintsStartRow = 3000;
        
        // Определяем количество строк для чтения (до строки 2999 или до конца, если меньше)
        const lastRow = sheet.getLastRow();
        const maxDataRow = Math.min(lastRow, hintsStartRow - 1);
        
        if (maxDataRow < 1) {
          Logger.log('❌ Таблица пуста');
          return createJsonResponse(JSON.stringify({success:false, error:'Таблица пуста'}));
        }
        
        // Читаем основные данные (строки 1 до maxDataRow)
        const mainData = sheet.getRange(1, 1, maxDataRow, 3).getValues();
        
        let found = false;
        
        // Нормализуем номер задачи для сравнения (извлекаем числовую часть)
        const normalizeTaskNumber = (numStr) => {
          const str = String(numStr || '').trim();
          const match = str.match(/^(\d+)/);
          return match ? match[1] : str;
        };
        
        const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
        Logger.log(`🔍 Ищем задачу с нормализованным номером: "${normalizedTaskNumber}" (исходный: "${taskNumber}")`);
        
        // Ищем задачу по номеру
        for (let i = 1; i < mainData.length; i++) {
          const rowNumberRaw = String(mainData[i][COL_NUMBER-1] || '').trim();
          const normalizedRowNumber = normalizeTaskNumber(rowNumberRaw);
          
          // Сравниваем нормализованные номера
          if (normalizedRowNumber === normalizedTaskNumber) {
            // Нашли задачу, обновляем статус
            sheet.getRange(i + 1, COL_STATUS).setValue(newStatus);
            Logger.log(`✅ Статус задачи №${taskNumber} (строка: "${rowNumberRaw}") изменён на "${newStatus}" в строке ${i+1}`);
            found = true;
            break;
          }
        }
        
        if (found) {
          return createJsonResponse(JSON.stringify({success:true, updated:true}));
        } else {
          // Дополнительное логирование для отладки
          Logger.log(`❌ Задача №${taskNumber} (нормализовано: "${normalizedTaskNumber}") не найдена в таблице`);
          Logger.log(`   Проверено строк: ${mainData.length - 1}`);
          if (mainData.length > 1 && mainData.length <= 10) {
            Logger.log(`   Примеры номеров в таблице: ${mainData.slice(1, Math.min(6, mainData.length)).map((row, idx) => `строка ${idx+2}: "${String(row[COL_NUMBER-1] || '').trim()}"`).join(', ')}`);
          }
          return createJsonResponse(JSON.stringify({success:false, error:'Задача не найдена'}));
        }
      } else {
        Logger.log('❌ taskNumber или newStatus пустой');
        return createJsonResponse(JSON.stringify({success:false, error:'taskNumber или newStatus не указан'}));
      }
    } catch(err) { 
      Logger.log('❌ changeStatus error: ' + err);
      return createJsonResponse(JSON.stringify({success:false, error:err.toString()}));
    }
  }
// ================== КОНЕЦ changeStatus ====================
  
  // ========================================
  // ЗАГРУЗКА ДАННЫХ
  // ========================================
  
  try {
    // Открываем таблицу
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets()[0]; // Первый лист
    
    // 1. Читаем основные данные (строки 1-2999, столбцы A-C)
    const mainData = sheet.getRange(1, 1, 2999, 3).getValues();
    
    // 2. Читаем подсказки (строки 3000+, столбцы A-B)
    const hintsStartRow = 3000;
    const lastRow = sheet.getLastRow();
    let hintsData = [];
    
    // Проверяем, есть ли в таблице строки >= 3000
    if (lastRow >= hintsStartRow) {
      hintsData = sheet.getRange(hintsStartRow, 1, lastRow - hintsStartRow + 1, 2).getValues();
      Logger.log(`📖 Читаем подсказки из строк ${hintsStartRow}-${lastRow}`);
    } else {
      Logger.log(`⚠️ Строк с подсказками пока нет (lastRow=${lastRow}, требуется >= ${hintsStartRow})`);
    }
    
    // 3. Создаём мапу подсказок: номер задачи -> текст подсказки
    const hintsMap = {};
    for (let i = 0; i < hintsData.length; i++) {
      const taskNum = String(hintsData[i][0] || '').trim();
      const hintText = String(hintsData[i][1] || '').trim();
      if (taskNum && hintText) {
        hintsMap[taskNum] = hintText;
      }
    }
    
    Logger.log(`📝 Загружено подсказок: ${Object.keys(hintsMap).length}`);
    
    // 4. Формируем список задач с подсказками
    const tasks = [];
    const COL_NUMBER = 1;
    const COL_STATUS = 2;
    const COL_DESCRIPTION = 3;

    for (let i = 1; i < mainData.length; i++) {
      const row = mainData[i];
      
      // Столбцы: A - Номер, B - Статус, C - Текст задачи
      const number = row[COL_NUMBER-1] ? String(row[COL_NUMBER-1]).trim() : '';
      const status = row[COL_STATUS-1] ? String(row[COL_STATUS-1]).trim() : '';
      const description = row[COL_DESCRIPTION-1] ? String(row[COL_DESCRIPTION-1]).trim() : '';
      
      // Пропускаем пустые строки
      if (!number || !status) continue;
      
      // Пропускаем заголовки
      if (number.toLowerCase() === 'номер' || status.toLowerCase() === 'статус') continue;
      
      tasks.push({
        number: number,
        status: status,
        description: description,
        hint: hintsMap[number] || '' // Берём подсказку из мапы
      });
    }
    
    // Возвращаем JSON
    const output = JSON.stringify({
      success: true,
      count: tasks.length,
      tasks: tasks,
      isAdmin: isAdmin,
      timestamp: new Date().toISOString()
    });
    
    return createJsonResponse(output);
      
  } catch (error) {
    // В случае ошибки
    const output = JSON.stringify({
      success: false,
      error: error.toString()
    });
    
    return createJsonResponse(output);
  }
}

