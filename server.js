import http from "node:http";
import {
  loadDb,
  saveDb,
  listTickets,
  exposureQueue,
  computeStats,
  registerTicket,
  correctTicket,
  finishExposure,
  trimTicket,
  reviewTicket,
  setBatchActive,
  addBatch,
  SLOT_CAPACITY,
  HttpError,
} from "./archive.js";
import { page } from "./page.js";

const port = Number(process.env.PORT || 3040);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function fail(res, error) {
  if (error instanceof SyntaxError) return send(res, 400, { code: "bad_json", error: error.message });
  const status = error.status || 500;
  send(res, status, { code: error.code || "server_error", error: error.message });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }

    const db = await loadDb();
    const persist = async () => saveDb(db);
    const ticketId = (p) => url.pathname.match(/^\/api\/tickets\/([^/]+)\/([^/]+)$/);

    if (req.method === "GET" && url.pathname === "/api/state") {
      return send(res, 200, {
        tickets: listTickets(db),
        queue: exposureQueue(db),
        batches: db.batches,
        stats: computeStats(db),
        capacity: SLOT_CAPACITY,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/tickets") {
      return send(res, 200, listTickets(db));
    }
    if (req.method === "GET" && url.pathname === "/api/queue") {
      return send(res, 200, exposureQueue(db));
    }
    if (req.method === "GET" && url.pathname === "/api/stats") {
      return send(res, 200, computeStats(db));
    }

    if (req.method === "POST" && url.pathname === "/api/tickets") {
      const result = registerTicket(db, await body(req));
      await persist();
      return send(res, result.reused ? 200 : 201, result);
    }

    const m = ticketId();
    if (m) {
      const [, id, action] = m;
      if (req.method === "PATCH" && action === "correct") {
        const result = correctTicket(db, id, await body(req));
        await persist();
        return send(res, 200, result);
      }
      if (req.method === "POST" && action === "complete") {
        const result = finishExposure(db, id);
        await persist();
        return send(res, 200, result);
      }
      if (req.method === "POST" && action === "trim") {
        const result = trimTicket(db, id, await body(req));
        await persist();
        return send(res, 201, result);
      }
      if (req.method === "POST" && action === "review") {
        const result = reviewTicket(db, id, await body(req));
        await persist();
        return send(res, 201, result);
      }
    }

    const batchMatch = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
    if (batchMatch && req.method === "PATCH") {
      const input = await body(req);
      const batch = setBatchActive(db, batchMatch[1], input.active);
      await persist();
      return send(res, 200, batch);
    }
    if (req.method === "POST" && url.pathname === "/api/batches") {
      const batch = addBatch(db, await body(req));
      await persist();
      return send(res, 201, batch);
    }

    send(res, 404, { code: "not_found", error: "not_found" });
  } catch (error) {
    fail(res, error);
  }
});

server.listen(port, () =>
  console.log("蓝晒漏光补晒准入台 listening on http://localhost:" + port)
);
