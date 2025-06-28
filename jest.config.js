export default {
  testEnvironment: 'miniflare',
  testEnvironmentOptions: {
    durableObjects: {
      BOTNAMESPACE: 'BotNamespace',
      WSNAMESPACE: 'WSNamespace'
    },
    bindings: {
      TELEGRAM_BOT_TOKEN: 'test-token',
      ETH_MERCHANT_WALLET: '0xtestwallet',
      TON_MERCHANT_WALLET: 'EQtestwallet',
      PAYMENT_SERVERS: 'https://example.com/api/transaction',
      WORKER_URL: 'https://your-worker-url.com',
      WS_API_KEY: 'test-api-key'
    },
    modules: ['./worker.js']
  }
};
