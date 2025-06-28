// worker.js (Cloudflare Durable Worker)

import { decode } from 'uint8-base64';

const BotNamespace = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.kv = state.storage;
  }

  async fetch(request) {
    try {
      const body = await request.json();
      const chatId =
        body.message?.chat.id?.toString() ||
        body.callback_query?.message?.chat.id?.toString();
      if (!chatId) return new Response('Invalid request', { status: 400 });

      let user = (await this.kv.get(chatId, { type: 'json' })) || {
        stage: 'START',
        data: {},
        messageId: null,
      };

      let reply = '';
      let keyboard = [];
      let parseMode = null;

      // پردازش /start با داده پرداخت
      if (body.message?.text?.startsWith('/start pay_')) {
        const parts = body.message.text.split(' ');
        if (parts.length > 1) {
          const base64Str = parts[1].split('_')[1];
          try {
            const decoded = decode(base64Str);
            const decodedStr = new TextDecoder().decode(decoded);
            user.data.package = JSON.parse(decodedStr);
            user.data.amount = user.data.package.usdPrice;
          } catch (e) {
            reply = 'Error decoding package information';
          }
        }
      }

      switch (user.stage) {
        case 'START':
          reply = `💎 *Welcome to Daimonium Purchase Process!*\n` +
                  `You're about to buy tokens using USDT before listing.\n` +
                  `Here’s how it works:\n` +
                  `1️⃣ Choose *currency* (only USDT supported)\n` +
                  `2️⃣ Select *network* (Ethereum, BSC, Polygon, etc)\n` +
                  `3️⃣ Enter your *own wallet address* (you will send USDT from this address)\n` +
                  `4️⃣ The bot shows a *merchant address* — send the exact amount to it manually from your wallet\n` +
                  `5️⃣ After payment, reply with the *transaction hash (tx_hash)*\n\n` +
                  `🚫 Do *NOT* send screenshots or links — only the 64-character hash is accepted.\n` +
                  `✅ Example:\n` +
                  `\`0xabc1234...7890def\`\n` +
                  `⚠️ If you send from exchanges, payment may fail or be delayed.\n\n` +
                  `👇 Please select your currency to continue:`;
          parseMode = 'Markdown';
          keyboard = [[{ text: 'USDT', callback_data: 'USDT' }]];
          user.stage = 'CURRENCY';
          break;

        case 'CURRENCY': {
          const currency = body.callback_query?.data;
          if (!currency) {
            reply = 'Please select a currency using the buttons';
            break;
          }
          user.data.currency = currency;
          reply = `Please select the network for ${currency}:`;
          keyboard = [
            [{ text: 'Ethereum', callback_data: 'Ethereum' }],
            [{ text: 'BSC', callback_data: 'BSC' }],
            [{ text: 'Polygon', callback_data: 'Polygon' }],
            [{ text: 'Arbitrum', callback_data: 'Arbitrum' }],
            [{ text: 'Optimism', callback_data: 'Optimism' }],
            [{ text: 'TON', callback_data: 'TON' }],
          ];
          user.stage = 'NETWORK';
          break;
        }

        case 'NETWORK': {
          const network = body.callback_query?.data;
          if (!network) {
            reply = 'Please select a network using the buttons';
            break;
          }
          user.data.network = network;
          reply = 'Great! Now please enter your wallet address (the address you will send USDT from):';
          user.stage = 'WALLET';
          break;
        }

        case 'WALLET': {
          const wallet = body.message?.text?.trim();
          if (!wallet || !/^(0x[a-fA-F0-9]{40}|EQ[a-zA-Z0-9_-]{48})$/.test(wallet)) {
            reply = '❌ Invalid wallet address format. Please try again.';
            break;
          }
          user.data.wallet = wallet;
          user.data.merchant =
            user.data.network === 'TON'
              ? this.env.TON_MERCHANT_WALLET
              : this.env.ETH_MERCHANT_WALLET;
          reply = `Please send exactly ${user.data.amount} ${user.data.currency} to the address below:\n\n` +
                  `${user.data.merchant}\n\n` +
                  `After payment, please reply with the transaction hash (tx_hash).`;
          parseMode = 'Markdown';
          user.stage = 'TX_HASH';
          break;
        }

        case 'TX_HASH': {
          const txHash = body.message?.text?.trim();
          if (!txHash || !/^[A-Fa-f0-9]{64}$/.test(txHash)) {
            reply = '❌ Invalid transaction hash. Please try again.';
            break;
          }
          user.data.tx_hash = txHash;
          const paymentData = {
            user_id: user.data.package?.userId || chatId,
            currency: user.data.currency,
            network: user.data.network,
            amount: user.data.amount,
            merchant_wallet: user.data.merchant,
            sender_wallet: user.data.wallet,
            tx_hash: user.data.tx_hash,
          };

          try {
            const result = await this.sendViaWebSocket(paymentData.user_id, paymentData);
            reply =
              result?.status === 'confirmed'
                ? '✅ Your payment has been confirmed! Your purchase is now active.'
                : `❌ Payment failed or error: ${result?.message || 'Unknown error'}`;
          } catch (error) {
            reply = `❌ Error processing payment: ${error.message}`;
          }

          // ریست stage و داده‌ها
          await this.kv.put(chatId, JSON.stringify({ stage: 'START', data: {} }));

          // در TX_HASH همیشه sendMessage
          await fetch(
            `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: reply,
                parse_mode: 'Markdown'
              }),
            }
          );
          return new Response('OK');
        }
      }

      // ذخیره state برای سایر مراحل
      await this.kv.put(chatId, JSON.stringify(user));

      // ارسال پاسخ استاندارد (editMessageText یا sendMessage)
      const method = body.callback_query ? 'editMessageText' : 'sendMessage';
      const payload = {
        chat_id: chatId,
        text: reply,
        ...(parseMode && { parse_mode: parseMode }),
        ...(keyboard.length > 0 && { reply_markup: { inline_keyboard: keyboard } }),
      };

      await fetch(
        `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      return new Response('OK');
    } catch (error) {
      console.error('Bot error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  async sendViaWebSocket(userId, data) {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.env.WORKER_URL.replace('https', 'wss')}/ws?userId=${encodeURIComponent(
        userId
      )}&api_key=${this.env.WS_API_KEY}`;
      const ws = new WebSocket(wsUrl);
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Timeout after 10 seconds'));
          ws.close();
        }
      }, 10000);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ action: 'confirm_payment', data }));
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'payment_result' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(msg.data);
            ws.close();
          }
        } catch {}
      });

      ws.addEventListener('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      ws.addEventListener('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('Connection closed before response'));
        }
      });
    });
  }
};

const WSNamespace = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.healthyServers = env.PAYMENT_SERVERS.split(',');
    this.clients = new Map();
    this.startHealthCheck();
  }

  startHealthCheck() {
    this.healthInterval = setInterval(async () => {
      const newHealthy = [];
      for (const url of this.env.PAYMENT_SERVERS.split(',')) {
        try {
          const healthUrl = url.replace('/api/transaction', '/health');
          const response = await fetch(healthUrl, {
            headers: { 'X-API-KEY': this.env.WS_API_KEY }
          });
          if (response.status === 200) newHealthy.push(url);
        } catch (e) {
          console.log(`Health check failed for ${url}: ${e}`);
        }
      }
      if (newHealthy.length > 0) this.healthyServers = newHealthy;
    }, 30000);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/notify') {
      const apiKey = url.searchParams.get('api_key');
      if (apiKey !== this.env.WS_API_KEY) return new Response('Invalid API Key', { status: 403 });
      const payload = await request.json();
      const userId = payload.userId || payload.user_id;
      const event = payload.event;
      const data = payload.data || {};
      if (!userId) return new Response('Missing user ID', { status: 400 });
      const ws = this.clients.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
        return new Response(JSON.stringify({ status: 'sent' }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response(JSON.stringify({ status: 'user_not_connected' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const userId = url.searchParams.get('userId');
      const apiKey = url.searchParams.get('api_key');
      if (apiKey !== this.env.WS_API_KEY) return new Response('Invalid API Key', { status: 403 });
      const [client, server] = Object.values(new WebSocketPair());
      this.handleWebSocket(server, userId);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Expected WebSocket upgrade or POST request', { status: 400 });
  }

  handleWebSocket(ws, userId) {
    ws.accept();
    this.clients.set(userId, ws);
    ws.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.action === 'confirm_payment' || msg.action === 'payment_request') {
          if (this.healthyServers.length === 0) {
            ws.send(JSON.stringify({ event: 'payment_result', data: { status: 'error', message: 'No available payment servers' } }));
            return;
          }
          const targetUrl = this.healthyServers[Math.floor(Math.random() * this.healthyServers.length)];
          try {
            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': this.env.WS_API_KEY
              },
              body: JSON.stringify(msg.data)
            });
            const result = await response.json();
            ws.send(JSON.stringify({ event: 'payment_result', data: result }));
          } catch (error) {
            ws.send(JSON.stringify({ event: 'payment_result', data: { status: 'error', message: error.message } }));
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({ event: 'payment_result', data: { status: 'error', message: 'Invalid message format' } }));
      }
    });
    ws.addEventListener('close', () => { this.clients.delete(userId); });
    ws.addEventListener('error', () => { this.clients.delete(userId); });
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const id = env.WSNAMESPACE.idFromName('main');
      const obj = env.WSNAMESPACE.get(id);
      return obj.fetch(request);
    }
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      const id = env.BOTNAMESPACE.idFromName('main');
      const obj = env.BOTNAMESPACE.get(id);
      return obj.fetch(request);
    }
    if (url.pathname === '/notify' && request.method === 'POST') {
      const id = env.WSNAMESPACE.idFromName('main');
      const obj = env.WSNAMESPACE.get(id);
      return obj.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
  async scheduled(event, env, ctx) {}
};

// انتهای worker.js

export { BotNamespace, WSNamespace };
export default {
  async fetch(request, env) { … },
  async scheduled(event, env, ctx) { … }
};
