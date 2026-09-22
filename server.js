import http from "node:http";
import { 加载存档, 保存存档 } from "./存档.js";
import {
  业务错误,
  登记检测单,
  更正检测单,
  修边复核,
  入盒,
  完成补晒,
  统计,
  曝光队列,
  是否未结束,
} from "./判定.js";
import { 页面 } from "./页面.js";

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
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await 加载存档();
    const findOrder = (id) => db.orders.find((o) => o.id === id || o.code === id);
    const save = () => 保存存档(db);

    if (req.method === "GET" && url.pathname === "/") return html(res, 页面());

    // 列表、队列、统计同一份存档派生，一次快照返回，保证三处一致
    if (req.method === "GET" && url.pathname === "/api/state")
      return send(res, 200, { orders: db.orders, queue: 曝光队列(db.orders), stats: 统计(db.orders), batches: db.batches });
    if (req.method === "GET" && url.pathname === "/api/orders") return send(res, 200, db.orders);
    if (req.method === "GET" && url.pathname === "/api/queue") return send(res, 200, 曝光队列(db.orders));
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, 统计(db.orders));
    if (req.method === "GET" && url.pathname === "/api/batches") return send(res, 200, db.batches);

    if (req.method === "POST" && url.pathname === "/api/orders") {
      const result = 登记检测单(await body(req), db);
      await save();
      return send(res, result.reused ? 200 : 201, result);
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)(\/([^/]+))?$/);
    if (orderMatch) {
      const order = findOrder(decodeURIComponent(orderMatch[1]));
      if (!order) return send(res, 404, { error: "检测单不存在" });
      const sub = orderMatch[3];

      if (!sub && req.method === "PATCH") {
        更正检测单(order, await body(req), db);
        await save();
        return send(res, 200, order);
      }
      if (sub === "reviews" && req.method === "POST") {
        修边复核(order, await body(req));
        await save();
        return send(res, 201, order);
      }
      if (sub === "box" && req.method === "POST") {
        入盒(order);
        await save();
        return send(res, 200, order);
      }
      if (sub === "finish-resun" && req.method === "POST") {
        完成补晒(order);
        await save();
        return send(res, 200, order);
      }
      return send(res, 404, { error: "not_found" });
    }

    if (req.method === "POST" && url.pathname === "/api/batches") {
      const input = await body(req);
      const name = String(input.name || "").trim();
      if (!name) throw new 业务错误("批次名称不能为空");
      if (db.batches.some((b) => b.name === name)) throw new 业务错误("批次已存在");
      db.batches.push({ name, note: String(input.note || "").trim(), active: true });
      await save();
      return send(res, 201, db.batches);
    }
    const batchMatch = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
    if (batchMatch && req.method === "PATCH") {
      const batch = db.batches.find((b) => b.name === decodeURIComponent(batchMatch[1]));
      if (!batch) return send(res, 404, { error: "遮挡批次不存在" });
      const input = await body(req);
      if (typeof input.active === "boolean") batch.active = input.active;
      if (typeof input.note === "string") batch.note = input.note;
      await save();
      return send(res, 200, batch);
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof 业务错误 || error instanceof SyntaxError) return send(res, 400, { error: error.message });
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("漏光补晒准入台 listening on http://localhost:" + port));
