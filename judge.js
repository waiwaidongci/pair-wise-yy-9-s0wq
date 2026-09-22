// 判定业务：漏光补晒准入规则（纯逻辑，不读写文件）

export const MAX_LEAK_RATIO = 15; // 漏光占比上限，超过只转待修边
export const MIN_EXTRA_SECONDS = 90; // 补晒秒数下限，不足只转待修边
export const MAX_TRIM_LEAK = 5; // 修边复核漏光上限
export const REQUIRED_REVIEWS = 2; // 换人复核次数

export const STATUS = {
  PENDING_TRIM: "待修边",
  ADMITTED: "补晒准入",
  BOXED: "已入盒",
};
export const STATUS_LIST = [STATUS.PENDING_TRIM, STATUS.ADMITTED, STATUS.BOXED];

// 检测单结束后不再算“未结束”
export function isOpenTicket(ticket) {
  return ticket.status !== STATUS.BOXED;
}

// 同片仅一张未结束检测单
export function findOpenTicket(tickets, plateCode) {
  return (tickets || []).find(
    (t) => t.plateCode === plateCode && isOpenTicket(t)
  );
}

// 遮挡批次须存在且未停用，未知批次按停用处理（判紧不判松）
export function isBatchUsable(db, batchCode) {
  const batch = (db.batches || []).find((b) => b.code === batchCode);
  return Boolean(batch && batch.active);
}

// 准入判定：任一条件不满足都只转待修边，不占曝光位
export function decideAdmission({ leakRatio, extraSeconds, batchUsable }) {
  const reasons = [];
  if (leakRatio > MAX_LEAK_RATIO) {
    reasons.push("漏光占比超" + MAX_LEAK_RATIO + "%");
  }
  if (!batchUsable) reasons.push("遮挡批次停用");
  if (extraSeconds < MIN_EXTRA_SECONDS) {
    reasons.push("补晒不足" + MIN_EXTRA_SECONDS + "秒");
  }
  return { admitted: reasons.length === 0, reasons };
}

export function admittedTickets(tickets) {
  return (tickets || []).filter(
    (t) => t.status === STATUS.ADMITTED && Number.isInteger(t.slotNo)
  );
}

// 曝光位从 1 号顺序取空位
export function nextFreeSlot(tickets, capacity) {
  const used = new Set(admittedTickets(tickets).map((t) => t.slotNo));
  for (let i = 1; i <= capacity; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

// 按判定结果落状态：准入则占曝光位，否则只转待修边
export function applyAdmission(ticket, decision, slotNo) {
  if (decision.admitted) {
    ticket.status = STATUS.ADMITTED;
    ticket.slotNo = slotNo;
    ticket.slotAt = ticket.updatedAt;
  } else {
    ticket.status = STATUS.PENDING_TRIM;
    ticket.slotNo = null;
    ticket.slotAt = null;
  }
  ticket.repairman = null;
  ticket.reviews = [];
  return ticket;
}

// 补晒完成：让出曝光位，进入修边
export function completeExposure(ticket) {
  if (ticket.status !== STATUS.ADMITTED) {
    return { ok: false, error: "只有补晒准入中的检测单能完成补晒" };
  }
  ticket.status = STATUS.PENDING_TRIM;
  ticket.slotNo = null;
  ticket.slotAt = null;
  return { ok: true };
}

// 修边登记：开启新一轮复核，旧复核清空
export function recordRepairRound(ticket, { repairman }) {
  if (ticket.status !== STATUS.PENDING_TRIM) {
    return { ok: false, error: "只有待修边的检测单能登记修边" };
  }
  if (!repairman) return { ok: false, error: "修边人必填" };
  ticket.repairman = repairman;
  ticket.reviews = [];
  return { ok: true };
}

// 修边复核校验：换人、两轮、漏光均不高于5%
export function validateReview(ticket, { reviewer, leakRatio }) {
  if (ticket.status !== STATUS.PENDING_TRIM) {
    return { ok: false, error: "只有待修边的检测单能提交复核" };
  }
  if (!ticket.repairman) return { ok: false, error: "请先登记修边人再复核" };
  if (!reviewer) return { ok: false, error: "复核人必填" };
  if (reviewer === ticket.repairman) {
    return { ok: false, error: "复核必须换人，不能由修边人本人复核" };
  }
  const last = ticket.reviews[ticket.reviews.length - 1];
  if (last && last.reviewer === reviewer) {
    return { ok: false, error: "两次复核必须换人" };
  }
  if (typeof leakRatio !== "number" || Number.isNaN(leakRatio) ||
      leakRatio < 0 || leakRatio > 100) {
    return { ok: false, error: "复核漏光占比须为0到100之间的数字" };
  }
  return { ok: true };
}

// 提交一次复核；任一轮高于5%则本轮作废重来，两轮均过才入盒
export function applyReview(ticket, { reviewer, leakRatio }, now) {
  const check = validateReview(ticket, { reviewer, leakRatio });
  if (!check.ok) return check;
  if (leakRatio > MAX_TRIM_LEAK) {
    ticket.reviews = [];
    return { ok: true, passed: false, boxed: false };
  }
  ticket.reviews.push({ reviewer, leakRatio, at: now });
  if (ticket.reviews.length >= REQUIRED_REVIEWS) {
    ticket.status = STATUS.BOXED;
    ticket.slotNo = null;
    ticket.slotAt = null;
    return { ok: true, passed: true, boxed: true };
  }
  return { ok: true, passed: true, boxed: false };
}

// 更正占比或遮挡批次：结论失效，旧复核作废，让出曝光位后按现值重算
// 曝光位由存档层在返回 admitted 时重新分配
export function recompute(ticket, batchUsable, now) {
  ticket.repairman = null;
  ticket.reviews = [];
  ticket.slotNo = null;
  ticket.slotAt = null;
  const decision = decideAdmission({
    leakRatio: ticket.leakRatio,
    extraSeconds: ticket.extraSeconds,
    batchUsable,
  });
  ticket.status = decision.admitted ? STATUS.ADMITTED : STATUS.PENDING_TRIM;
  ticket.updatedAt = now;
  return decision;
}
