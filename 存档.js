// 漏光补晒准入台 —— 存档业务
// 负责 JSON 数据落盘、初始数据，以及旧版结论的留档。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "light-leak-resun-desk.json");

// 遮挡批次：active=false 即停用，停用批次的单子只能转待修边
export const seed = {
  batches: [
    { name: "ZP-A01", note: "整版遮光卡纸", active: true },
    { name: "ZP-A02", note: "局部黑胶带", active: true },
    { name: "ZP-B11", note: "旧版红膜（已停用）", active: false },
  ],
  orders: [
    {
      id: "JC-SEED-01",
      code: "LP-2026-018",
      leakRatio: 8,
      maskBatch: "ZP-A01",
      resunSeconds: 120,
      inspector: "沈砚",
      status: "补晒排队",
      conclusion: { route: "补晒准入", reasons: [], version: 1, at: "2026-09-21T08:20:00.000Z" },
      reviews: [],
      archives: [],
      history: [
        {
          at: "2026-09-21T08:20:00.000Z",
          step: "登记",
          note: "检查人 沈砚：漏光 8%、补晒 120 秒，准入补晒并占用曝光位",
        },
      ],
      createdAt: "2026-09-21T08:20:00.000Z",
    },
    {
      id: "JC-SEED-02",
      code: "LP-2026-021",
      leakRatio: 18,
      maskBatch: "ZP-B11",
      resunSeconds: 75,
      inspector: "林樵",
      status: "待修边",
      conclusion: {
        route: "待修边",
        reasons: ["遮挡批次 ZP-B11 已停用", "漏光占比 18% 超过 15%", "补晒 75 秒不足 90 秒"],
        version: 1,
        at: "2026-09-21T09:05:00.000Z",
      },
      reviews: [],
      archives: [],
      history: [
        {
          at: "2026-09-21T09:05:00.000Z",
          step: "登记",
          note: "检查人 林樵：遮挡批次 ZP-B11 已停用；漏光占比 18% 超过 15%；补晒 75 秒不足 90 秒，只转待修边，不占曝光位",
        },
      ],
      createdAt: "2026-09-21T09:05:00.000Z",
    },
  ],
};

export async function 加载存档() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.batches ||= [];
  db.orders ||= [];
  return db;
}

export async function 保存存档(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

// 更正占比/遮挡批次时，把旧版结论快照追加留档，不覆盖历史。
// snapshot 由调用方在覆写前传入，保证与旧版结论同源。
export function 归档旧结论(order, reason, at, snapshot) {
  order.archives ||= [];
  order.archives.push({
    reason,
    at,
    snapshot: structuredClone(snapshot),
  });
}
