// ============================================
// TELEGRAM КОММУНИКАЦИЯ - Клиентская часть
// ============================================
/*
// Конфигурация
const TELEGRAM_CONFIG = {
    // URL вашего Google Apps Script (замените после деплоя)
    apiUrl: 'https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLid-oHGIsJmgQrerKpSenvynFuk4jCSR4jMFiQR3kr21cN57bsBOFfASlJ964FwjufZ_qn2wlY89aeAzzsX4Ru8UJk4nHzz3A1BHOu1uwOw1ytsTluie1hC9I1ZPg8DLi29ql5vyYrC_YxjpLMz1pDmwXXU5WGDZzhY57-4OGB-yWEA2Wb-5m--V-IXGlMLfch5Jdylagv_LEFJ_3RGfDhTMqmam19bc-aiGnLhBiihBnVlfKQlUrx1bBpfIrtKtDjlBH0B2tTQ9HwilkkiSeggUE-t3Q&lib=MUJ8YiNDuqZJO4nE7bADS_CMNGS6H3WL4',
    checkInterval: 15000, // Проверять новые сообщения каждые 15 секунд
    userId: null // Будет сгенерирован при первом визите
};

// Состояние
let telegramState = {
    isDialogOpen: false,
    checkTimer: null,
    hasNotifiedVisit: false
};

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Генерируем или получаем ID пользователя
    TELEGRAM_CONFIG.userId = getUserId();
    
    // Создаём UI элементы
    createTelegramUI();
    
    // Отправляем уведомление о визите (один раз за сессию)
    if (!sessionStorage.getItem('visitNotified')) {
        notifyVisit();
        sessionStorage.setItem('visitNotified', 'true');
    }
    
    // Начинаем проверять новые сообщения
    startCheckingMessages();
    
    // Обработчик изменения страницы (для SPA)
    window.addEventListener('popstate', () => {
        notifyPageChange();
    });
});

// ============================================
// ГЕНЕРАЦИЯ ID ПОЛЬЗОВАТЕЛЯ
// ============================================

function getUserId() {
    let userId = localStorage.getItem('telegram_user_id');
    
    if (!userId) {
        // Генерируем уникальный ID
        userId = 'user_' + generateRandomId();
        localStorage.setItem('telegram_user_id', userId);
    }
    
    return userId;
}

function generateRandomId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// СОЗДАНИЕ UI
// ============================================

function createTelegramUI() {
    // Контейнер для уведомлений
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'telegramNotifications';
    notificationContainer.className = 'telegram-notifications-container';
    document.body.appendChild(notificationContainer);
    
    // Кнопка открытия диалога (плавающая)
    const chatButton = document.createElement('button');
    chatButton.id = 'telegramChatButton';
    chatButton.className = 'telegram-chat-button';
    chatButton.innerHTML = '💬';
    chatButton.title = 'Открыть диалог';
    chatButton.addEventListener('click', openDialog);
    document.body.appendChild(chatButton);
    
    // Диалоговое окно
    const dialog = document.createElement('div');
    dialog.id = 'telegramDialog';
    dialog.className = 'telegram-dialog hidden';
    dialog.innerHTML = `
        <div class="telegram-dialog-header">
            <h3>💬 Диалог с администратором</h3>
            <button class="telegram-close-btn" onclick="closeDialog()">✕</button>
        </div>
        <div class="telegram-dialog-body">
            <div class="telegram-messages" id="telegramMessages">
                <div class="telegram-welcome-message">
                    Привет! 👋<br>
                    Если у вас есть вопросы или предложения, напишите мне здесь.
                </div>
            </div>
            <div class="telegram-input-container">
                <textarea 
                    id="telegramMessageInput" 
                    placeholder="Введите сообщение..."
                    rows="3"
                ></textarea>
                <button class="telegram-send-btn" onclick="sendMessage()">
                    Отправить 📤
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    // Обработчик Enter (с Shift для новой строки)
    const input = dialog.querySelector('#telegramMessageInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// ============================================
// УВЕДОМЛЕНИЕ О ВИЗИТЕ
// ============================================

async function notifyVisit() {
    try {
        const currentPage = getCurrentPageName();
        
        const response = await fetch(TELEGRAM_CONFIG.apiUrl, {
            method: 'POST',
            mode: 'no-cors', // Важно для Google Apps Script
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'userVisit',
                userId: TELEGRAM_CONFIG.userId,
                currentPage: currentPage
            })
        });
        
        console.log('✅ Visit notified');
    } catch(err) {
        console.error('❌ Error notifying visit:', err);
    }
}

function notifyPageChange() {
    // Для случая, если пользователь переходит между страницами
    notifyVisit();
}

function getCurrentPageName() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    
    // Маппинг страниц на читаемые названия
    const pageNames = {
        'index.html': 'Главная страница',
        'physics.html': 'Физика',
        'math.html': 'Алгебра',
        'geometry.html': 'Геометрия',
        'chemistry.html': 'Химия',
        'matcenter.html': 'МатЦентр'
    };
    
    return pageNames[page] || page;
}

// ============================================
// ПРОВЕРКА НОВЫХ СООБЩЕНИЙ
// ============================================

function startCheckingMessages() {
    // Проверяем сразу
    checkNewMessages();
    
    // Устанавливаем таймер для периодической проверки
    telegramState.checkTimer = setInterval(() => {
        checkNewMessages();
    }, TELEGRAM_CONFIG.checkInterval);
}

async function checkNewMessages() {
    try {
        const url = `${TELEGRAM_CONFIG.apiUrl}?action=getMessages&userId=${TELEGRAM_CONFIG.userId}`;
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors'
        });
        
        // Для no-cors не можем прочитать response, используем альтернативный метод
        // Используем jsonp или просто POST с обработкой через iframe
        
        // Альтернатива: используем POST с обработкой
        const postResponse = await fetch(TELEGRAM_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain', // Обход CORS
            },
            body: JSON.stringify({
                action: 'getMessages',
                userId: TELEGRAM_CONFIG.userId
            })
        });
        
        const data = await postResponse.json();
        
        if (data.success && data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                showNotification(msg.message);
                addMessageToDialog(msg.message, 'admin');
            });
        }
    } catch(err) {
        console.error('Error checking messages:', err);
    }
}

// ============================================
// ПОКАЗ УВЕДОМЛЕНИЯ
// ============================================

function showNotification(message) {
    const container = document.getElementById('telegramNotifications');
    
    const notification = document.createElement('div');
    notification.className = 'telegram-notification';
    notification.innerHTML = `
        <div class="telegram-notification-header">
            <span class="telegram-notification-icon">📨</span>
            <span class="telegram-notification-title">Сообщение от администратора</span>
        </div>
        <div class="telegram-notification-body">
            ${escapeHtml(message)}
        </div>
        <button class="telegram-notification-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(notification);
    
    // Показываем с анимацией
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Автоматически скрываем через 10 секунд
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 10000);
    
    // Воспроизводим звук (если есть)
    playNotificationSound();
}

// ============================================
// ДИАЛОГОВОЕ ОКНО
// ============================================

function openDialog() {
    const dialog = document.getElementById('telegramDialog');
    dialog.classList.remove('hidden');
    telegramState.isDialogOpen = true;
    
    // Фокус на поле ввода
    setTimeout(() => {
        document.getElementById('telegramMessageInput').focus();
    }, 100);
}

function closeDialog() {
    const dialog = document.getElementById('telegramDialog');
    dialog.classList.add('hidden');
    telegramState.isDialogOpen = false;
}

// ============================================
// ОТПРАВКА СООБЩЕНИЯ
// ============================================

async function sendMessage() {
    const input = document.getElementById('telegramMessageInput');
    const message = input.value.trim();
    
    if (!message) {
        return;
    }
    
    // Добавляем сообщение в диалог
    addMessageToDialog(message, 'user');
    
    // Очищаем поле ввода
    input.value = '';
    
    // Отправляем на сервер
    try {
        await fetch(TELEGRAM_CONFIG.apiUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'userMessage',
                userId: TELEGRAM_CONFIG.userId,
                message: message
            })
        });
        
        // Показываем подтверждение
        addMessageToDialog('✅ Сообщение отправлено', 'system');
        
    } catch(err) {
        console.error('Error sending message:', err);
        addMessageToDialog('❌ Ошибка отправки. Попробуйте позже.', 'system');
    }
}

function addMessageToDialog(message, sender) {
    const messagesContainer = document.getElementById('telegramMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `telegram-message telegram-message-${sender}`;
    
    const time = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="telegram-message-text">${escapeHtml(message)}</div>
        <div class="telegram-message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Прокручиваем вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    try {
        // Создаём простой звук уведомления
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch(err) {
        // Звук не критичен, игнорируем ошибки
    }
}

// ============================================
// ОЧИСТКА ПРИ ЗАКРЫТИИ
// ============================================

window.addEventListener('beforeunload', () => {
    if (telegramState.checkTimer) {
        clearInterval(telegramState.checkTimer);
    }
});

// Экспортируем функции в глобальную область для onclick
window.openDialog = openDialog;
window.closeDialog = closeDialog;
window.sendMessage = sendMessage;

console.log('✅ Telegram коммуникация инициализирована');
console.log('👤 Ваш ID:', TELEGRAM_CONFIG.userId);

*/