// Standalone Apps Script owned by the project's mail account.
const SENDER = 'almanion.mail@gmail.com';
const REQUEST_LIFETIME = 2 * 60 * 1000;

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return reply({ service: 'almanion-verification-mail', version: 1 });
}

function doPost(event) {
  try {
    if (!event || event.queryString || !event.postData || !event.postData.contents ||
        event.postData.contents.length > 1500) return reply({ success: false });
    const wrapper = JSON.parse(event.postData.contents);
    const properties = PropertiesService.getScriptProperties();
    const key = properties.getProperty('ALMANION_MAIL_KEY');
    if (!key || key.length < 32 || typeof wrapper.message !== 'string' ||
        !/^[\w-]{43}$/.test(wrapper.signature || '')) return reply({ success: false });
    const signature = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(wrapper.message, key)).replace(/=+$/, '');
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) mismatch |= signature.charCodeAt(i) ^ wrapper.signature.charCodeAt(i);
    if (mismatch) return reply({ success: false });

    const message = JSON.parse(wrapper.message);
    const now = Date.now();
    if (message.version !== 1 || !Number.isSafeInteger(message.time) ||
        Math.abs(now - message.time) > REQUEST_LIFETIME ||
        Session.getEffectiveUser().getEmail().toLowerCase() !== SENDER) return reply({ success: false });
    if (message.action === 'check') {
      return reply({ success: true, sender: SENDER, available: MailApp.getRemainingDailyQuota() > 0 });
    }
    if (message.action !== 'send' || !/^[a-f\d-]{36}$/.test(message.id || '') ||
        typeof message.to !== 'string' || message.to.length > 254 || !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+$/.test(message.to) ||
        typeof message.code !== 'string' || !/^\d{6}$/.test(message.code)) return reply({ success: false });
    return reply(deliverCode(properties, message, now));
  } catch (_) {
    return reply({ success: false, reason: 'delivery' });
  }
}

function deliverCode(properties, message, now) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const receipt = 'sent:' + message.id;
    if (properties.getProperty(receipt)) return { success: true };
    if (MailApp.getRemainingDailyQuota() < 1) return { success: false, reason: 'mail_quota' };
    if (Number(properties.getProperty('nextCleanup') || 0) <= now) {
      const saved = properties.getProperties();
      Object.keys(saved).filter(key => key.indexOf('sent:') === 0 && Number(saved[key]) < now)
        .forEach(key => properties.deleteProperty(key));
      properties.setProperty('nextCleanup', String(now + REQUEST_LIFETIME));
    }
    MailApp.sendEmail({
      to: message.to, subject: 'Код подтверждения Almanion', name: 'Almanion',
      body: 'Ваш код подтверждения почты в Almanion — ' + message.code +
        '.\n\nКод действует 10 минут. Если вы не запрашивали код, пропустите это письмо.'
    });
    properties.setProperty(receipt, String(message.time + REQUEST_LIFETIME));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}
