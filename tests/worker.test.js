/**
 * @jest-environment miniflare
 */

import { Miniflare } from "miniflare";
import workerModule from "../worker.js"; // مسیر به فایل worker.js شما

describe("BotNamespace Durable Object", () => {
  let mf;

  beforeAll(() => {
    mf = new Miniflare({
      script: workerModule,
      modules: true,
      durableObjects: {
        BOTNAMESPACE: "BotNamespace",
        WSNAMESPACE: "WSNamespace"
      },
      bindings: {
        // شبیه‌سازی مقادیر env
        BOTNAMESPACE: { name: "main" },
        WSNAMESPACE: { name: "main" },
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

  // می‌توانید موارد بیشتری اضافه کنید
});
