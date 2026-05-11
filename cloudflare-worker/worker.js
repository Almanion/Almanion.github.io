/**
 * Cloudflare Worker — прокси для Telegram-уведомлений о предложениях блоков.
 *
 * Секреты (задаются через wrangler secret put):
 *   TG_TOKEN   — токен бота от @BotFather
 *   TG_CHAT_ID — твой chat_id
 */

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env) {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: CORS });
        }

        let data;
        try {
            data = await request.json();
        } catch {
            return new Response(JSON.stringify({ ok: false, error: 'bad json' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
        }

        const { author, type, preview, code } = data;

        if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
            return new Response(JSON.stringify({ ok: false, error: 'secrets not set' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
        }

        function esc(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        const msg =
            '📨 <b>Предложение блока</b>\n' +
            '👤 ' + esc(author) + '\n' +
            '📁 Тип: <code>' + esc(type) + '</code>\n' +
            '📝 ' + esc(preview) + '\n\n' +
            '<pre><code>' + esc(code) + '</code></pre>';

        const tgRes = await fetch(
            `https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id:    env.TG_CHAT_ID,
                    text:       msg,
                    parse_mode: 'HTML',
                }),
            }
        );

        const tgJson = await tgRes.json();
        if (!tgJson.ok) {
            console.error('Telegram error:', JSON.stringify(tgJson));
        }

        return new Response(JSON.stringify({ ok: tgJson.ok, tg: tgJson.description ?? null }), {
            headers: { 'Content-Type': 'application/json', ...CORS },
        });
    },
};
