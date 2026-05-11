// ============================================
// ТЕСТОВЫЕ ФУНКЦИИ для проверки Telegram Bot
// ============================================
// Скопируйте эти функции в конец файла telegram-bot.gs
// или создайте отдельный файл в том же проекте Google Apps Script

// Настройки (должны совпадать с основным файлом)
const TEST_TELEGRAM_BOT_TOKEN = '8567341752:AAGYi6tT0vOqtZsIRpK1m3Eoi9Izs2Q3CtQ';
const TEST_ADMIN_TELEGRAM_ID = '5777542073';
const TEST_SPREADSHEET_ID = '1dta8rN5z7dmAugBPoX5jIzh-YD2i0ENqwZbrB1avN24';
const TEST_TELEGRAM_API_URL = `https://api.telegram.org/bot${TEST_TELEGRAM_BOT_TOKEN}`;

// ============================================
// ТЕСТ 1: Проверка доступа к таблице
// ============================================
function test1_TableAccess() {
  try {
    Logger.log('🔍 Проверка доступа к таблице...');
    
    const spreadsheet = SpreadsheetApp.openById(TEST_SPREADSHEET_ID);
    const sheetName = spreadsheet.getName();
    const url = spreadsheet.getUrl();
    
    Logger.log('✅ УСПЕХ!');
    Logger.log('   Название таблицы: ' + sheetName);
    Logger.log('   URL: ' + url);
    Logger.log('   Количество листов: ' + spreadsheet.getSheets().length);
    
    return {
      success: true,
      name: sheetName,
      url: url,
      sheets: spreadsheet.getSheets().length
    };
    
  } catch(err) {
    Logger.log('❌ ОШИБКА доступа к таблице!');
    Logger.log('   Ошибка: ' + err.toString());
    Logger.log('   Проверьте:');
    Logger.log('   1. ID таблицы правильный?');
    Logger.log('   2. У скрипта есть доступ к таблице?');
    
    return {
      success: false,
      error: err.toString()
    };
  }
}

// ============================================
// ТЕСТ 2: Проверка Telegram Bot API
// ============================================
function test2_TelegramBotAPI() {
  try {
    Logger.log('🔍 Проверка Telegram Bot API...');
    
    const url = `${TEST_TELEGRAM_API_URL}/getMe`;
    const response = UrlFetchApp.fetch(url);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      Logger.log('✅ УСПЕХ! Бот активен:');
      Logger.log('   ID: ' + result.result.id);
      Logger.log('   Имя: ' + result.result.first_name);
      Logger.log('   Username: @' + result.result.username);
      Logger.log('   Это бот: ' + result.result.is_bot);
      
      return {
        success: true,
        bot: result.result
      };
    } else {
      Logger.log('❌ ОШИБКА: Бот не отвечает');
      Logger.log('   Ответ: ' + JSON.stringify(result));
      
      return {
        success: false,
        error: 'Bot API returned error'
      };
    }
    
  } catch(err) {
    Logger.log('❌ ОШИБКА подключения к Telegram!');
    Logger.log('   Ошибка: ' + err.toString());
    Logger.log('   Проверьте токен бота!');
    
    return {
      success: false,
      error: err.toString()
    };
  }
}

// ============================================
// ТЕСТ 3: Отправка тестового сообщения в Telegram
// ============================================
function test3_SendTestMessage() {
  try {
    Logger.log('🔍 Отправка тестового сообщения...');
    
    const testMessage = '🧪 ТЕСТ: Бот работает!\n\n' +
                       '✅ Система коммуникации настроена правильно\n' +
                       '⏰ Время: ' + new Date().toLocaleString('ru-RU');
    
    const url = `${TEST_TELEGRAM_API_URL}/sendMessage`;
    const payload = {
      chat_id: TEST_ADMIN_TELEGRAM_ID,
      text: testMessage,
      parse_mode: 'HTML'
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      Logger.log('✅ УСПЕХ! Сообщение отправлено!');
      Logger.log('   Message ID: ' + result.result.message_id);
      Logger.log('   Проверьте Telegram - сообщение должно прийти');
      
      return {
        success: true,
        message_id: result.result.message_id
      };
    } else {
      Logger.log('❌ ОШИБКА отправки!');
      Logger.log('   Ответ: ' + JSON.stringify(result));
      Logger.log('   Проверьте:');
      Logger.log('   1. Ваш Telegram ID правильный?');
      Logger.log('   2. Вы запустили бота командой /start?');
      
      return {
        success: false,
        error: result
      };
    }
    
  } catch(err) {
    Logger.log('❌ ОШИБКА!');
    Logger.log('   Ошибка: ' + err.toString());
    
    return {
      success: false,
      error: err.toString()
    };
  }
}

// ============================================
// ТЕСТ 4: Создание листов в таблице
// ============================================
function test4_CreateSheets() {
  try {
    Logger.log('🔍 Создание листов Visits и Messages...');
    
    const spreadsheet = SpreadsheetApp.openById(TEST_SPREADSHEET_ID);
    
    // Проверяем/создаём лист Visits
    let visitsSheet = spreadsheet.getSheetByName('Visits');
    if (!visitsSheet) {
      Logger.log('   Создаю лист Visits...');
      visitsSheet = spreadsheet.insertSheet('Visits');
      visitsSheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'UserID', 'Page', 'Date']]);
      visitsSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      Logger.log('   ✅ Лист Visits создан');
    } else {
      Logger.log('   ℹ️ Лист Visits уже существует');
    }
    
    // Проверяем/создаём лист Messages
    let messagesSheet = spreadsheet.getSheetByName('Messages');
    if (!messagesSheet) {
      Logger.log('   Создаю лист Messages...');
      messagesSheet = spreadsheet.insertSheet('Messages');
      messagesSheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'UserID', 'Message', 'Sender', 'Read']]);
      messagesSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
      Logger.log('   ✅ Лист Messages создан');
    } else {
      Logger.log('   ℹ️ Лист Messages уже существует');
    }
    
    Logger.log('✅ УСПЕХ! Листы готовы');
    
    return {
      success: true,
      visits: visitsSheet ? 'OK' : 'Created',
      messages: messagesSheet ? 'OK' : 'Created'
    };
    
  } catch(err) {
    Logger.log('❌ ОШИБКА создания листов!');
    Logger.log('   Ошибка: ' + err.toString());
    
    return {
      success: false,
      error: err.toString()
    };
  }
}

// ============================================
// ТЕСТ 5: Запись тестовых данных
// ============================================
function test5_WriteTestData() {
  try {
    Logger.log('🔍 Запись тестовых данных...');
    
    const spreadsheet = SpreadsheetApp.openById(TEST_SPREADSHEET_ID);
    
    // Тестовый визит
    let visitsSheet = spreadsheet.getSheetByName('Visits');
    if (!visitsSheet) {
      Logger.log('   ⚠️ Лист Visits не найден, создаю...');
      test4_CreateSheets();
      visitsSheet = spreadsheet.getSheetByName('Visits');
    }
    
    const timestamp = new Date();
    visitsSheet.appendRow([
      timestamp,
      'test_user_12345',
      'Тестовая страница',
      Utilities.formatDate(timestamp, 'GMT+3', 'dd.MM.yyyy, HH:mm:ss')
    ]);
    Logger.log('   ✅ Тестовый визит записан');
    
    // Тестовое сообщение
    let messagesSheet = spreadsheet.getSheetByName('Messages');
    if (!messagesSheet) {
      Logger.log('   ⚠️ Лист Messages не найден, создаю...');
      test4_CreateSheets();
      messagesSheet = spreadsheet.getSheetByName('Messages');
    }
    
    messagesSheet.appendRow([
      timestamp,
      'test_user_12345',
      'Тестовое сообщение от пользователя',
      'user',
      'false'
    ]);
    Logger.log('   ✅ Тестовое сообщение записано');
    
    Logger.log('✅ УСПЕХ! Данные записаны');
    Logger.log('   Откройте таблицу и проверьте данные:');
    Logger.log('   ' + spreadsheet.getUrl());
    
    return {
      success: true,
      url: spreadsheet.getUrl()
    };
    
  } catch(err) {
    Logger.log('❌ ОШИБКА записи данных!');
    Logger.log('   Ошибка: ' + err.toString());
    
    return {
      success: false,
      error: err.toString()
    };
  }
}

// ============================================
// ЗАПУСТИТЬ ВСЕ ТЕСТЫ
// ============================================
function runAllTests() {
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log('🧪 ЗАПУСК ВСЕХ ТЕСТОВ');
  Logger.log('═══════════════════════════════════════');
  Logger.log('');
  
  // Тест 1
  Logger.log('╔════════════════════════════════════╗');
  Logger.log('║  ТЕСТ 1: Доступ к таблице         ║');
  Logger.log('╚════════════════════════════════════╝');
  const test1 = test1_TableAccess();
  Logger.log('');
  
  // Тест 2
  Logger.log('╔════════════════════════════════════╗');
  Logger.log('║  ТЕСТ 2: Telegram Bot API         ║');
  Logger.log('╚════════════════════════════════════╝');
  const test2 = test2_TelegramBotAPI();
  Logger.log('');
  
  // Тест 3
  Logger.log('╔════════════════════════════════════╗');
  Logger.log('║  ТЕСТ 3: Отправка сообщения       ║');
  Logger.log('╚════════════════════════════════════╝');
  const test3 = test3_SendTestMessage();
  Logger.log('');
  
  // Тест 4
  Logger.log('╔════════════════════════════════════╗');
  Logger.log('║  ТЕСТ 4: Создание листов           ║');
  Logger.log('╚════════════════════════════════════╝');
  const test4 = test4_CreateSheets();
  Logger.log('');
  
  // Тест 5
  Logger.log('╔════════════════════════════════════╗');
  Logger.log('║  ТЕСТ 5: Запись данных             ║');
  Logger.log('╚════════════════════════════════════╝');
  const test5 = test5_WriteTestData();
  Logger.log('');
  
  // Итоги
  Logger.log('═══════════════════════════════════════');
  Logger.log('📊 РЕЗУЛЬТАТЫ ТЕСТОВ:');
  Logger.log('═══════════════════════════════════════');
  Logger.log('Тест 1 (Таблица):    ' + (test1.success ? '✅ PASSED' : '❌ FAILED'));
  Logger.log('Тест 2 (Bot API):    ' + (test2.success ? '✅ PASSED' : '❌ FAILED'));
  Logger.log('Тест 3 (Отправка):   ' + (test3.success ? '✅ PASSED' : '❌ FAILED'));
  Logger.log('Тест 4 (Листы):      ' + (test4.success ? '✅ PASSED' : '❌ FAILED'));
  Logger.log('Тест 5 (Запись):     ' + (test5.success ? '✅ PASSED' : '❌ FAILED'));
  Logger.log('═══════════════════════════════════════');
  
  const allPassed = test1.success && test2.success && test3.success && test4.success && test5.success;
  
  if (allPassed) {
    Logger.log('');
    Logger.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
    Logger.log('✅ Система готова к работе!');
    Logger.log('');
  } else {
    Logger.log('');
    Logger.log('⚠️ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОШЛИ');
    Logger.log('Исправьте ошибки выше и запустите снова');
    Logger.log('');
  }
  
  return {
    test1: test1.success,
    test2: test2.success,
    test3: test3.success,
    test4: test4.success,
    test5: test5.success,
    allPassed: allPassed
  };
}





