// 存档业务：JSON 库读写、检测单登记/更正/修边/复核、旧版留档
// 列表、队列、统计全部从同一份 tickets 派生，保证刷新后一致

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS,
  STATUS_LIST,
  findOpenTicket,
  isBatchUsable,
  decideAdmission,
  applyAdmission,
  completeExposure,
  recordRepairRound,
  validateReview,
  applyReview,
  recompute,
  admittedTickets,
  nextFreeSlot,
} from "./judge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "light-leak-resun-station.json");
export const SLOT_CAPACITY = 6;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const seed = {
  batches: [
    { code: "MASK-A", active: true, note: "主用遮挡黑卡" },
    { code: "MASK-B", active: false, note: "卡面透光，已停用" },
  ],
  tickets: [],
  ticketSeq: 1,
};

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.batches ||= [];
  db.tickets ||= [];
  db.ticketSeq ||= db.tickets.length + 1;
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function newTicketNo(seq) {
  return "LL-" + String(seq).padStart(4, "0");
}

// 列表/队列/统计的唯一数据源
export function listTickets(db) {
  return db.tickets.map((t) => ({
    ...t,
    batchActive: isBatchUsable(db, t.maskBatch),
    versionCount: (t.versions || []).length + 1,
  }));
}

export function exposureQueue(db) {
  return admittedTickets(db.tickets)
    .slice()
    .sort((a, b) => a.slotNo - b.slotNo);
}

export function computeStats(db) {
  const stats = Object.fromEntries(STATUS_LIST.map((s) => [s, 0]));
  for (const t of db.tickets) {
    if (stats[t.status] !== undefined) stats[t.status] += 1;
  }
  const admitted = admittedTickets(db.tickets);
  return {
    ...stats,
    占用曝光位: admitted.length,
    剩余曝光位: SLOT_CAPACITY - admitted.length,
    曝光位总数: SLOT_CAPACITY,
    检测单总数: db.tickets.length,
  };
}

// 登记漏光检测单：同片仅一张未结束单，重复沿用首次
export function registerTicket(db, input, now = new Date().toISOString()) {
  const plateCode = String(input.plateCode || "").trim();
  if (!plateCode) throw new HttpError(400, "plate_code_required", "底片编号必填");
  const existing = findOpenTicket(db.tickets, plateCode);
  if (existing) {
    return { ticket: existing, reused: true, reasons: [], admitted: existing.status === STATUS.ADMITTED };
  }
  const leakRatio = Number(input.leakRatio);
  const extraSeconds = Number(input.extraSeconds);
  const maskBatch = String(input.maskBatch || "").trim();
  const inspector = String(input.inspector || "").trim();
  if (!Number.isFinite(leakRatio) || leakRatio < 0 || leakRatio > 100) {
    throw new HttpError(400, "invalid_leak_ratio", "漏光占比须为0到100之间的数字");
  }
  if (!Number.isFinite(extraSeconds) || extraSeconds < 0) {
    throw new HttpError(400, "invalid_extra_seconds", "补晒秒数须为不小于0的数字");
  }
  if (!maskBatch) throw new HttpError(400, "mask_batch_required", "遮挡批次必填");
  if (!inspector) throw new HttpError(400, "inspector_required", "检查人必填");

  const batchUsable = isBatchUsable(db, maskBatch);
  const decision = decideAdmission({ leakRatio, extraSeconds, batchUsable });

  let slotNo = null;
  if (decision.admitted) {
    slotNo = nextFreeSlot(db.tickets, SLOT_CAPACITY);
    if (slotNo === null) {
      throw new HttpError(409, "no_free_slot", "曝光位已满，无法准入");
    }
  }

  const ticket = {
    id: newTicketNo(db.ticketSeq++),
    plateCode,
    leakRatio,
    maskBatch,
    extraSeconds,
    inspector,
    status: STATUS.PENDING_TRIM,
    slotNo: null,
    slotAt: null,
    repairman: null,
    reviews: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, action: "登记", note: "检查人 " + inspector }],
  };
  applyAdmission(ticket, decision, slotNo);
  ticket.history.push({
    at: now,
    action: decision.admitted ? "准入" : "转待修边",
    note: decision.admitted
      ? "占曝光位 " + slotNo + " 号"
      : decision.reasons.join("；"),
  });
  db.tickets.unshift(ticket);
  return { ticket, reused: false, reasons: decision.reasons, admitted: decision.admitted };
}

// 更正漏光占比或遮挡批次：结论失效重算，旧版留档
export function correctTicket(db, id, patch, now = new Date().toISOString()) {
  const ticket = db.tickets.find((t) => t.id === id);
  if (!ticket) throw new HttpError(404, "ticket_not_found", "检测单不存在");
  if (ticket.status === STATUS.BOXED) {
    throw new HttpError(409, "ticket_closed", "已入盒检测单不可更正，请另开新单");
  }

  const changes = {};
  if (patch.leakRatio !== undefined) {
    const value = Number(patch.leakRatio);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new HttpError(400, "invalid_leak_ratio", "漏光占比须为0到100之间的数字");
    }
    if (value !== ticket.leakRatio) changes.leakRatio = value;
  }
  if (patch.maskBatch !== undefined) {
    const value = String(patch.maskBatch).trim();
    if (!value) throw new HttpError(400, "mask_batch_required", "遮挡批次必填");
    if (value !== ticket.maskBatch) changes.maskBatch = value;
  }
  if (patch.extraSeconds !== undefined && Number(patch.extraSeconds) !== ticket.extraSeconds) {
    throw new HttpError(400, "extra_seconds_immutable", "补晒秒数不可更正，仅占比或遮挡批次可改");
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    throw new HttpError(400, "no_effective_change", "没有有效的占比或遮挡批次变更");
  }

  // 旧版整单留档（含当时结论、曝光位、复核痕迹）
  ticket.versions.push({
    version: ticket.versions.length + 1,
    at: now,
    snapshot: structuredClone({
      leakRatio: ticket.leakRatio,
      maskBatch: ticket.maskBatch,
      extraSeconds: ticket.extraSeconds,
      status: ticket.status,
      slotNo: ticket.slotNo,
      repairman: ticket.repairman,
      reviews: ticket.reviews,
    }),
    changes: structuredClone(changes),
  });

  Object.assign(ticket, changes);
  const batchUsable = isBatchUsable(db, ticket.maskBatch);
  const decision = recompute(ticket, batchUsable, now);
  if (decision.admitted) {
    const slotNo = nextFreeSlot(db.tickets, SLOT_CAPACITY);
    if (slotNo === null) {
      throw new HttpError(409, "no_free_slot", "重算后应准入，但曝光位已满");
    }
    ticket.slotNo = slotNo;
    ticket.slotAt = now;
  }
  ticket.history.push({
    at: now,
    action: "更正重算",
    note:
      keys.map((k) => (k === "leakRatio" ? "漏光占比" : "遮挡批次")).join("、") +
      "变更；旧版 v" + ticket.versions.length + " 留档；" +
      (decision.admitted ? "重新准入，占 " + ticket.slotNo + " 号位" : decision.reasons.join("；")),
  });
  return { ticket, reasons: decision.reasons, admitted: decision.admitted };
}

// 登记补晒完成，让出曝光位转修边
export function finishExposure(db, id, now = new Date().toISOString()) {
  const ticket = db.tickets.find((t) => t.id === id);
  if (!ticket) throw new HttpError(404, "ticket_not_found", "检测单不存在");
  const result = completeExposure(ticket);
  if (!result.ok) throw new HttpError(409, "not_admitted", result.error);
  ticket.updatedAt = now;
  ticket.history.push({ at: now, action: "补晒完成", note: "让出曝光位，转修边" });
  return { ticket };
}

// 修边登记（换人复核的前置）
export function trimTicket(db, id, input, now = new Date().toISOString()) {
  const ticket = db.tickets.find((t) => t.id === id);
  if (!ticket) throw new HttpError(404, "ticket_not_found", "检测单不存在");
  const repairman = String(input.repairman || "").trim();
  const result = recordRepairRound(ticket, { repairman });
  if (!result.ok) throw new HttpError(409, "cannot_trim", result.error);
  ticket.updatedAt = now;
  ticket.history.push({ at: now, action: "修边", note: "修边人 " + repairman + "，复核重新计数" });
  return { ticket };
}

// 换人复核：两次漏光均不高于5%才入盒
export function reviewTicket(db, id, input, now = new Date().toISOString()) {
  const ticket = db.tickets.find((t) => t.id === id);
  if (!ticket) throw new HttpError(404, "ticket_not_found", "检测单不存在");
  const reviewer = String(input.reviewer || "").trim();
  const leakRatio = Number(input.leakRatio);
  const payload = { reviewer, leakRatio };
  const check = validateReview(ticket, payload);
  if (!check.ok) throw new HttpError(409, "review_rejected", check.error);
  const result = applyReview(ticket, payload, now);
  ticket.updatedAt = now;
  if (!result.passed) {
    ticket.history.push({ at: now, action: "复核", note: reviewer + " 测得 " + leakRatio + "% 高于5%，本轮复核作废，请重修" });
  } else if (result.boxed) {
    ticket.history.push({ at: now, action: "入盒", note: "两轮换人复核漏光均不高于5%，准予入盒" });
  } else {
    ticket.history.push({ at: now, action: "复核", note: reviewer + " 测得 " + leakRatio + "%，第1轮通过，待换人第2轮" });
  }
  return { ticket, result };
}

// 遮挡批次停用/启用
export function setBatchActive(db, code, active, now = new Date().toISOString()) {
  const batch = db.batches.find((b) => b.code === code);
  if (!batch) throw new HttpError(404, "batch_not_found", "遮挡批次不存在");
  batch.active = Boolean(active);
  return batch;
}

export function addBatch(db, input) {
  const code = String(input.code || "").trim();
  if (!code) throw new HttpError(400, "batch_code_required", "批次号必填");
  if (db.batches.some((b) => b.code === code)) {
    throw new HttpError(409, "batch_exists", "遮挡批次已存在");
  }
  const batch = { code, active: true, note: String(input.note || "").trim() };
  db.batches.push(batch);
  return batch;
}
