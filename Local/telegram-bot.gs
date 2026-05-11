// ============================================
// TELEGRAM BOT для коммуникации с пользователями
// ============================================

// Настройки
const TELEGRAM_BOT_TOKEN = '8567341752:AAGYi6tT0vOqtZsIRpK1m3Eoi9Izs2Q3CtQ';
const ADMIN_TELEGRAM_ID = '5777542073';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ⚠️ ВАЖНО: Создайте НОВУЮ Google Таблицу и вставьте её ID сюда!
// Инструкция:
// 1. Откройте https://sheets.google.com/ и создайте новую таблицу
// 2. Назовите её "Telegram Communications - Almanion"
// 3. Скопируйте ID из URL (https://docs.google.com/spreadsheets/d/ID_ЗДЕСЬ/edit)
// 4. Вставьте ID ниже вместо YOUR_NEW_SPREADSHEET_ID
const SPREADSHEET_ID = '1dta8rN5z7dmAugBPoX5jIzh-YD2i0ENqwZbrB1avN24';

// ============================================
// ОБРАБОТКА POST ЗАПРОСОВ (сайт + Telegram webhook)
// ============================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Проверяем, это webhook от Telegram или запрос от сайта
    if (data.update_id !== undefined || data.message !== undefined) {
      // Это webhook от Telegram - обрабатываем и сразу возвращаем 200 OK
      Logger.log('📨 Получен webhook от Telegram');
      
      // Обрабатываем асинхронно
      processWebhookAsync(data);
      
      // Сразу возвращаем 200 OK (важно для Telegram!)
      return ContentService
        .createTextOutput(JSON.stringify({ok: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Это запрос от сайта
    const action = data.action || '';
    Logger.log('🌐 Получен запрос от сайта: ' + action);
    
    switch(action) {
      case 'userVisit':
        return handleUserVisit(data);
        
      case 'userMessage':
        return handleUserMessage(data);
        
      case 'getMessages':
        return handleGetMessages(data);
        
      default:
        return createResponse({success: false, error: 'Unknown action'});
    }
  } catch(err) {
    Logger.log('❌ Error: ' + err);
    return createResponse({success: false, error: err.toString()});
  }
}

// Асинхронная обработка webhook (чтобы не блокировать ответ Telegram)
function processWebhookAsync(update) {
  try {
    handleTelegramWebhook(update);
  } catch(err) {
    Logger.log('❌ Async processing error: ' + err);
  }
}

// ============================================
// ОБРАБОТКА GET ЗАПРОСОВ
// ============================================

function doGet(e) {
  const action = e.parameter.action || '';
  
  try {
    switch(action) {
      case 'getMessages':
        return handleGetMessages(e.parameter);
        
      default:
        return createResponse({success: false, error: 'Use POST for most actions'});
    }
  } catch(err) {
    Logger.log('Error: ' + err);
    return createResponse({success: false, error: err.toString()});
  }
}

// ============================================
// ОБРАБОТКА ВИЗИТА ПОЛЬЗОВАТЕЛЯ
// ============================================

function handleUserVisit(data) {
  const userId = data.userId || 'unknown';
  const currentPage = data.currentPage || 'Главная страница';
  const timestamp = new Date();
  
  try {
    // Сохраняем информацию о визите в таблицу
    saveVisitToSheet(userId, currentPage, timestamp);
    
    // Отправляем уведомление в Telegram
    const message = `🔔 Новый посетитель на сайте!\n\n` +
                   `👤 ID: ${userId}\n` +
                   `📄 Страница: ${currentPage}\n` +
                   `⏰ Время: ${formatDateTime(timestamp)}`;
    
    sendTelegramMessage(ADMIN_TELEGRAM_ID, message);
    
    return createResponse({
      success: true,
      message: 'Visit logged'
    });
  } catch(err) {
    Logger.log('Error in handleUserVisit: ' + err);
    return createResponse({success: false, error: err.toString()});
  }
}

// ============================================
// ОБРАБОТКА СООБЩЕНИЯ ОТ ПОЛЬЗОВАТЕЛЯ
// ============================================

function handleUserMessage(data) {
  const userId = data.userId || 'unknown';
  const message = data.message || '';
  const timestamp = new Date();
  
  try {
    // Сохраняем сообщение в таблицу
    saveMessageToSheet(userId, message, 'user', timestamp);
    
    // Отправляем в Telegram
    const telegramMessage = `💬 Сообщение от пользователя:\n\n` +
                           `👤 ID: ${userId}\n` +
                           `📝 Сообщение: ${message}\n` +
                           `⏰ Время: ${formatDateTime(timestamp)}`;
    
    sendTelegramMessage(ADMIN_TELEGRAM_ID, telegramMessage);
    
    return createResponse({
      success: true,
      message: 'Message sent'
    });
  } catch(err) {
    Logger.log('Error in handleUserMessage: ' + err);
    return createResponse({success: false, error: err.toString()});
  }
}

// ============================================
// ПОЛУЧЕНИЕ СООБЩЕНИЙ ДЛЯ ПОЛЬЗОВАТЕЛЯ
// ============================================

function handleGetMessages(data) {
  const userId = data.userId || '';
  
  try {
    // Получаем сообщения для конкретного пользователя из таблицы
    const messages = getMessagesFromSheet(userId);
    
    return createResponse({
      success: true,
      messages: messages
    });
  } catch(err) {
    Logger.log('Error in handleGetMessages: ' + err);
    return createResponse({success: false, error: err.toString()});
  }
}

// ============================================
// РАБОТА С ТАБЛИЦЕЙ
// ============================================

function saveVisitToSheet(userId, currentPage, timestamp) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName('Visits');
    
    // Создаём лист, если его нет
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Visits');
      sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'UserID', 'Page', 'Date']]);
    }
    
    sheet.appendRow([
      timestamp,
      userId,
      currentPage,
      formatDateTime(timestamp)
    ]);
    
  } catch(err) {
    Logger.log('Error saving visit: ' + err);
  }
}

function saveMessageToSheet(userId, message, sender, timestamp) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName('Messages');
    
    // Создаём лист, если его нет
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Messages');
      sheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'UserID', 'Message', 'Sender', 'Read']]);
    }
    
    sheet.appendRow([
      timestamp,
      userId,
      message,
      sender, // 'user' или 'admin'
      'false'
    ]);
    
  } catch(err) {
    Logger.log('Error saving message: ' + err);
  }
}

function getMessagesFromSheet(userId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Messages');
    
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    const messages = [];
    
    // Пропускаем заголовок (i = 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowUserId = String(row[1]);
      const sender = String(row[3]);
      const isRead = String(row[4]);
      
      // Возвращаем только непрочитанные сообщения от админа для этого пользователя
      if (rowUserId === userId && sender === 'admin' && isRead === 'false') {
        messages.push({
          message: String(row[2]),
          timestamp: row[0],
          sender: sender
        });
        
        // Помечаем как прочитанное
        sheet.getRange(i + 1, 5).setValue('true');
      }
    }
    
    return messages;
    
  } catch(err) {
    Logger.log('Error getting messages: ' + err);
    return [];
  }
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ В TELEGRAM
// ============================================

function sendTelegramMessage(chatId, text) {
  try {
    const url = `${TELEGRAM_API_URL}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
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
    
    if (!result.ok) {
      Logger.log('Telegram API error: ' + JSON.stringify(result));
    }
    
    return result.ok;
  } catch(err) {
    Logger.log('Error sending Telegram message: ' + err);
    return false;
  }
}

// ============================================
// ОБРАБОТКА WEBHOOK ОТ TELEGRAM
// ============================================

function handleTelegramWebhook(update) {
  try {
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';
      const messageId = update.message.message_id;
      
      Logger.log('📱 Получено сообщение от chatId: ' + chatId);
      Logger.log('📝 Текст: ' + text);
      
      // Проверяем, что это сообщение от админа
      if (String(chatId) === ADMIN_TELEGRAM_ID) {
        Logger.log('✅ Сообщение от админа');
        
        // Команда /send
        if (text.startsWith('/send ')) {
          const parts = text.substring(6).split(' ');
          if (parts.length >= 2) {
            const targetUserId = parts[0];
            const message = parts.slice(1).join(' ');
            
            Logger.log('📤 Отправка сообщения пользователю: ' + targetUserId);
            
            // Сохраняем сообщение в таблицу для отправки пользователю
            saveMessageToSheet(targetUserId, message, 'admin', new Date());
            
            // Подтверждение админу
            sendTelegramMessage(chatId, `✅ Сообщение отправлено пользователю ${targetUserId}`);
          } else {
            sendTelegramMessage(chatId, '❌ Формат: /send <userId> <message>');
          }
        }
        // Команда /broadcast
        else if (text.startsWith('/broadcast ')) {
          const message = text.substring(11);
          Logger.log('📢 Массовая рассылка: ' + message);
          
          broadcastMessage(message);
          sendTelegramMessage(chatId, `✅ Сообщение отправлено всем активным пользователям`);
        }
        // Команды /help и /start
        else if (text === '/help' || text === '/start') {
          Logger.log('ℹ️ Показ справки');
          
          const helpText = `🤖 <b>Бот управления сайтом</b>\n\n` +
                         `<b>Доступные команды:</b>\n\n` +
                         `📤 /send &lt;userId&gt; &lt;message&gt;\n` +
                         `   Отправить сообщение пользователю\n` +
                         `   Пример: /send user_abc123 Привет!\n\n` +
                         `📢 /broadcast &lt;message&gt;\n` +
                         `   Рассылка всем активным пользователям\n` +
                         `   (за последние 24 часа)\n\n` +
                         `ℹ️ /help - показать эту справку\n\n` +
                         `<i>Уведомления о визитах приходят автоматически</i>`;
          
          sendTelegramMessage(chatId, helpText);
        }
        // Неизвестная команда
        else {
          Logger.log('❓ Неизвестная команда');
          sendTelegramMessage(chatId, '❓ Неизвестная команда. Используйте /help для справки');
        }
      } else {
        Logger.log('⚠️ Сообщение не от админа (chatId: ' + chatId + ')');
      }
    }
    
    Logger.log('✅ Webhook обработан успешно');
      
  } catch(err) {
    Logger.log('❌ Webhook error: ' + err);
  }
}

// ============================================
// МАССОВАЯ РАССЫЛКА
// ============================================

function broadcastMessage(message) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const visitSheet = spreadsheet.getSheetByName('Visits');
    
    if (!visitSheet) {
      return;
    }
    
    // Получаем список уникальных пользователей за последние 24 часа
    const data = visitSheet.getDataRange().getValues();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeUsers = new Set();
    
    for (let i = 1; i < data.length; i++) {
      const visitTime = new Date(data[i][0]);
      if (visitTime > oneDayAgo) {
        activeUsers.add(String(data[i][1]));
      }
    }
    
    // Отправляем сообщение каждому активному пользователю
    activeUsers.forEach(userId => {
      if (userId !== 'unknown') {
        saveMessageToSheet(userId, message, 'admin', new Date());
      }
    });
    
  } catch(err) {
    Logger.log('Broadcast error: ' + err);
  }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function createResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  // Важно: устанавливаем правильные заголовки для Telegram
  return output;
}

function formatDateTime(date) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Moscow'
  };
  return date.toLocaleString('ru-RU', options);
}

// ============================================
// НАСТРОЙКА WEBHOOK (выполнить один раз)
// ============================================

function setWebhook() {
  // URL вашего развернутого скрипта (ОБНОВЛЁН - новый деплой)
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbzmIcJR8Dv_fVkv-ov1AGqHIMyr3O-8lIb51qFvIlrWqqZuwN6qkcsTz5RScaPBmUXW/exec';
  
  Logger.log('🔧 Настройка webhook...');
  Logger.log('📍 URL: ' + webhookUrl);
  
  const url = `${TELEGRAM_API_URL}/setWebhook`;
  const payload = {
    url: webhookUrl
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('📨 Ответ от Telegram:');
    Logger.log(JSON.stringify(result, null, 2));
    
    if (result.ok) {
      Logger.log('✅ УСПЕХ! Webhook установлен!');
      Logger.log('ℹ️ Теперь бот будет отвечать на команды');
    } else {
      Logger.log('❌ ОШИБКА: ' + result.description);
    }
    
    return result;
  } catch(err) {
    Logger.log('❌ Ошибка: ' + err);
    return {ok: false, error: err.toString()};
  }
}

function deleteWebhook() {
  const url = `${TELEGRAM_API_URL}/deleteWebhook`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

