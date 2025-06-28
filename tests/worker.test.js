import { Miniflare } from "miniflare";

describe("BotNamespace Durable Object", () => {
  let mf;

  beforeAll(() => {
    mf = new Miniflare({
      scriptPath: "../worker.js",   // مسیر به worker.js اصلاح شد
      modules: true,
      durableObjects: {
        BOTNAMESPACE: "BotNamespace",
        WSNAMESPACE: "WSNamespace"
      },
      bindings: {
        PAYMENT_SERVERS: "https://example.com/api/transaction",
        WS_API_KEY: "test-key",
        TELEGRAM_BOT_TOKEN: "test-token",
        TON_MERCHANT_WALLET: "EQtest",
        ETH_MERCHANT_WALLET: "0x" + "a".repeat(40),
        WORKER_URL: "https://worker.test"
      }
    });
  });

  test("responds 400 on invalid request", async () => {
    const res = await mf.dispatchFetch("https://test/telegram-webhook", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(400);
  });
});
