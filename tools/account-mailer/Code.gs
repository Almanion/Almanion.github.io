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
    MailApp.sendEmail(verificationEmail(message.to, message.code));
    properties.setProperty(receipt, String(message.time + REQUEST_LIFETIME));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function verificationEmail(to, code) {
  const instruction = 'Введите код в своём профиле.';
  const expiry = 'Код действует 10 минут.';
  const unsolicited = 'Если вы не запрашивали код, просто пропустите письмо.';
  const wordmark = theme => Utilities.newBlob(
    Utilities.base64Decode(MAIL_WORDMARKS[theme]), 'image/png', 'almanion-' + theme + '.png');
  return {
    to,
    subject: 'Код подтверждения Almanion',
    name: 'Almanion',
    body: ['Подтверждение почты', instruction, code, expiry, unsolicited].join('\n\n'),
    inlineImages: {
      almanionLight: wordmark('light'),
      almanionDark: wordmark('dark')
    },
    htmlBody: `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Код подтверждения Almanion</title>
  <style>
    @media (max-width: 400px) {
      .mail-heading { font-size: 22px !important; line-height: 28px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .mail-surface { background-color: #101018 !important; }
      .mail-card { background-color: #181822 !important; border-color: #2d2f45 !important; }
      .mail-title { color: #f0eff5 !important; }
      .mail-copy { color: #c0c0d4 !important; }
      .mail-code { background-color: #24263f !important; border-color: #3a3f68 !important; }
      .mail-digits { color: #c7ccff !important; }
      .mail-footer { border-color: #2d2f45 !important; }
      .mail-wordmark-light { display: none !important; }
      .mail-wordmark-dark { display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mail-surface" style="background-color:#f1f1f9">
    <tr><td align="center" style="padding:28px 12px">
      <!--[if mso]><table role="presentation" width="480" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mail-card"
          style="max-width:480px;background-color:#ffffff;border:1px solid #dedff0;border-radius:18px">
        <tr><td align="left" style="padding:26px 24px 24px;font-family:Arial,Helvetica,sans-serif">
          <img class="mail-wordmark-light" src="cid:almanionLight" alt="Almanion" width="154" height="34"
              style="display:block;border:0;color:#19192a;font:700 19px/34px Arial,Helvetica,sans-serif">
          <!--[if !mso]><!-->
          <img class="mail-wordmark-dark" src="cid:almanionDark" alt="Almanion" width="154" height="34"
              style="display:none;mso-hide:all;border:0;color:#f0eff5;font:700 19px/34px Arial,Helvetica,sans-serif">
          <!--<![endif]-->
          <h1 class="mail-title mail-heading" style="margin:21px 0 8px;color:#19192a;font-size:25px;line-height:32px;font-weight:700">Подтверждение почты</h1>
          <p class="mail-copy" style="margin:0 0 17px;color:#505169;font-size:16px;line-height:24px">${instruction}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mail-code"
              style="background-color:#eeefff;border:1px solid #dbddfc;border-radius:12px">
            <tr><td align="center" style="padding:16px 8px">
              <span class="mail-digits" style="color:#3c40a1;font-family:Consolas,'Courier New',monospace;font-size:36px;line-height:44px;letter-spacing:0.13em;font-weight:700;white-space:nowrap">${code}</span>
            </td></tr>
          </table>
          <p class="mail-copy" style="margin:10px 0 0;color:#505169;font-size:14px;line-height:20px;text-align:center">${expiry}</p>
          <p class="mail-copy mail-footer" style="margin:20px 0 0;padding-top:14px;border-top:1px solid #e6e6f1;color:#505169;font-size:13px;line-height:20px">${unsolicited}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`
  };
}
