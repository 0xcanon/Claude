/** Cloudflare Worker entry point for Dallas Bakery Wholesale. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

import { runInvoiceReminders } from "../app/invoice-reminders.ts";
import { runDueStandingOrders } from "../app/standing-orders.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    function secured(response: Response) {
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      if (url.protocol === "https:") {
        headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
      if (
        url.pathname.startsWith("/admin") ||
        url.pathname.startsWith("/api/admin") ||
        url.pathname.startsWith("/api/mobile/admin") ||
        url.pathname.startsWith("/api/mobile/buyer") ||
        url.pathname === "/api/wholesale-settings" ||
        url.pathname.startsWith("/api/buyer")
      ) {
        headers.set("Cache-Control", "no-store");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secured(response);
    }

    return secured(await handler.fetch(request, env, ctx));
  },
};

/**
 * Daily cron (triggers.crons in wrangler.deploy.jsonc): charge the standing
 * orders due today, then send the day's invoice reminders. Each job contains
 * and reports its own failures, so the handler itself only has to show up —
 * and the two are kept independent so a failure in one still lets the other
 * run.
 */
const scheduled = async (_event: { cron: string }, _env: Env, ctx: ExecutionContext) => {
  ctx.waitUntil(
    runDueStandingOrders()
      .then((outcomes) => {
        if (outcomes.length) {
          console.log(`Standing orders run: ${outcomes.filter((o) => o.ok).length}/${outcomes.length} charged.`);
        }
      })
      .catch((caught) => console.error("Standing orders run failed:", caught)),
  );
  ctx.waitUntil(
    runInvoiceReminders()
      .then((outcomes) => {
        if (outcomes.length) console.log(`Invoice reminders sent: ${outcomes.length}.`);
      })
      .catch((caught) => console.error("Invoice reminder run failed:", caught)),
  );
};

const workerWithCron = { ...worker, scheduled };

export default workerWithCron;
