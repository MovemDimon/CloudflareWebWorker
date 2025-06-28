/** @type {import('jest').Config} */
module.exports = {
  // نام پکیج محیط تست
  testEnvironment: "jest-environment-miniflare",
  testEnvironmentOptions: {
    // برای ماژول‌های ESM
    modules: true,
    // دوام‌‌آبجکت‌ها
    durableObjects: {
      BOTNAMESPACE: "BotNamespace",
      WSNAMESPACE: "WSNamespace"
    },
    // شبیه‌سازی متغیرهای env
    bindings: {
      PAYMENT_SERVERS: "https://example.com/api/transaction",
      WS_API_KEY: "test-key",
      TELEGRAM_BOT_TOKEN: "test-token",
      TON_MERCHANT_WALLET: "EQtest",
      ETH_MERCHANT_WALLET: "0x" + "a".repeat(40),
      WORKER_URL: "https://worker.test"
    }
  },
  transform: {}
};
