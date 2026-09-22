// 漏光补晒准入台 —— 判定业务
// 纯业务规则：只处理内存数据，不读写文件、不碰网络。
import { 归档旧结论 } from "./存档.js";

export const 漏光上限 = 15; // 漏光占比超过 15% 只能转待修边
export const 入盒漏光上限 = 5; // 修边两次复核漏光均须不高于 5%
export const 最少补晒秒数 = 90; // 补晒不足 90 秒不予准入

export const 状态 = {
  排队: "补晒排队", // 已准入，占用曝光位
  待修边: "待修边", // 不准入，不占曝光位
  已入盒: "已入盒", // 检测单结束
};

export class 业务错误 extends Error {
  constructor(message) {
    super(message);
    this.name = "业务错误";
  }
}

export function 是否未结束(order) {
  return order.status !== 状态.已入盒;
}

// 准入判定：任一条件不满足都只转待修边，不占曝光位
export function 判定结论({ leakRatio, maskBatch, resunSeconds }, batches) {
  const reasons = [];
  const batch = batches.find((b) => b.name === maskBatch);
  if (!batch) reasons.push(`遮挡批次 ${maskBatch} 未登记`);
  else if (batch.active === false) reasons.push(`遮挡批次 ${maskBatch} 已停用`);
  if (Number(leakRatio) > 漏光上限) reasons.push(`漏光占比 ${leakRatio}% 超过 ${漏光上限}%`);
  if (Number(resunSeconds) < 最少补晒秒数) reasons.push(`补晒 ${resunSeconds} 秒不足 ${最少补晒秒数} 秒`);
  return reasons.length === 0
    ? { route: "补晒准入", reasons: [] }
    : { route: "待修边", reasons };
}

export function 路线转状态(route) {
  return route === "补晒准入" ? 状态.排队 : 状态.待修边;
}

function 要求数字(value, label, { integer = false, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n)) || n > max) {
    throw new 业务错误(`${label}不合法`);
  }
  return n;
}
function 要求文本(value, label) {
  const t = String(value ?? "").trim();
  if (!t) throw new 业务错误(`${label}不能为空`);
  return t;
}
function 规整输入(input) {
  return {
    code: 要求文本(input.code, "底片编号"),
    leakRatio: 要求数字(input.leakRatio, "漏光占比", { max: 100 }),
    maskBatch: 要求文本(input.maskBatch, "遮挡批次"),
    resunSeconds: 要求数字(input.resunSeconds, "补晒秒数", { integer: true }),
    inspector: 要求文本(input.inspector, "检查人"),
  };
}
export function 新单号() {
  return "JC-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random() * 90 + 10);
}

// 登记检测单：同片已有未结束单时沿用首次，不再新建
export function 登记检测单(input, db, now = new Date().toISOString()) {
  const data = 规整输入(input);
  const existing = db.orders.find((o) => o.code === data.code && 是否未结束(o));
  if (existing) return { order: existing, reused: true };
  if (!db.batches.some((b) => b.name === data.maskBatch)) throw new 业务错误("遮挡批次未登记");

  const conclusion = { ...判定结论(data, db.batches), version: 1, at: now };
  const order = {
    id: 新单号(),
    ...data,
    status: 路线转状态(conclusion.route),
    conclusion,
    reviews: [],
    archives: [],
    history: [],
    createdAt: now,
  };
  order.history.push({
    at: now,
    step: "登记",
    note:
      conclusion.route === "补晒准入"
        ? `检查人 ${data.inspector}：漏光 ${data.leakRatio}%、补晒 ${data.resunSeconds} 秒，准入补晒并占用曝光位`
        : `检查人 ${data.inspector}：${conclusion.reasons.join("；")}，只转待修边，不占曝光位`,
  });
  db.orders.unshift(order);
  return { order, reused: false };
}

// 更正：更正占比或遮挡批次会让结论失效、旧版留档后重算
export function 更正检测单(order, patch, db, now = new Date().toISOString()) {
  if (!是否未结束(order)) throw new 业务错误("检测单已结束，不能更正；如需复查请重新登记");
  const next = {
    code: order.code,
    leakRatio:
      patch.leakRatio !== undefined ? 要求数字(patch.leakRatio, "漏光占比", { max: 100 }) : order.leakRatio,
    maskBatch: patch.maskBatch !== undefined ? 要求文本(patch.maskBatch, "遮挡批次") : order.maskBatch,
    resunSeconds:
      patch.resunSeconds !== undefined
        ? 要求数字(patch.resunSeconds, "补晒秒数", { integer: true })
        : order.resunSeconds,
    inspector: patch.inspector !== undefined ? 要求文本(patch.inspector, "检查人") : order.inspector,
  };
  if (!db.batches.some((b) => b.name === next.maskBatch)) throw new 业务错误("遮挡批次未登记");

  const 占比更正 = next.leakRatio !== order.leakRatio;
  const 批次更正 = next.maskBatch !== order.maskBatch;
  const 秒数更正 = next.resunSeconds !== order.resunSeconds;
  const 检查人更正 = next.inspector !== order.inspector;

  // 旧版快照必须在覆写之前取，保证留档与旧结论同源
  const 旧版快照 = {
    leakRatio: order.leakRatio,
    maskBatch: order.maskBatch,
    resunSeconds: order.resunSeconds,
    inspector: order.inspector,
    conclusion: order.conclusion,
  };
  Object.assign(order, next);

  if (占比更正 || 批次更正) {
    const oldVersion = order.conclusion.version;
    归档旧结论(
      order,
      占比更正 && 批次更正 ? "更正漏光占比与遮挡批次" : 占比更正 ? "更正漏光占比" : "更正遮挡批次",
      now,
      旧版快照
    );
    const r = 判定结论(order, db.batches);
    order.conclusion = { ...r, version: oldVersion + 1, at: now };
    order.status = 路线转状态(r.route);
    if (order.reviews.length) {
      const n = order.reviews.length;
      order.reviews = [];
      order.history.push({
        at: now,
        step: "结论失效",
        note: `第 ${oldVersion} 版结论已留档，原修边复核 ${n} 次随旧结论作废；重算为「${r.route}」`,
      });
    } else {
      order.history.push({
        at: now,
        step: "结论失效",
        note: `第 ${oldVersion} 版结论已留档，按更正后数据重算为「${r.route}」`,
      });
    }
  } else if (秒数更正) {
    const r = 判定结论(order, db.batches);
    const oldStatus = order.status;
    order.conclusion = { ...r, version: order.conclusion.version, at: now };
    order.status = 路线转状态(r.route);
    if (oldStatus !== order.status && order.reviews.length) {
      const n = order.reviews.length;
      order.reviews = [];
      order.history.push({
        at: now,
        step: "更正",
        note: `补晒秒数更正为 ${order.resunSeconds} 秒，结论同步重算为「${r.route}」，原修边复核 ${n} 次作废`,
      });
    } else {
      order.history.push({
        at: now,
        step: "更正",
        note: `补晒秒数更正为 ${order.resunSeconds} 秒，结论同步重算为「${r.route}」`,
      });
    }
  } else if (检查人更正) {
    order.history.push({ at: now, step: "更正", note: `检查人更正为 ${order.inspector}` });
  }
  return order;
}

// 修边复核：必须换人（不同于检查人，也不同于前一次复核人）
export function 修边复核(order, input, now = new Date().toISOString()) {
  if (order.status !== 状态.待修边) throw new 业务错误("只有待修边的检测单能登记修边复核");
  const reviewer = 要求文本(input.reviewer, "复核人");
  const leakRatio = 要求数字(input.leakRatio, "复核漏光占比", { max: 100 });
  if (reviewer === order.inspector) throw new 业务错误("复核须换人：复核人不能与检查人相同");
  if (order.reviews.some((r) => r.reviewer === reviewer)) throw new 业务错误("复核须换人：不能与前一次复核人相同");

  const review = {
    reviewer,
    leakRatio,
    pass: leakRatio <= 入盒漏光上限,
    at: now,
  };
  order.reviews.push(review);
  order.history.push({
    at: now,
    step: "修边复核",
    note: `${reviewer} 复核漏光 ${leakRatio}%，${review.pass ? "不高于" : "高于"} ${入盒漏光上限}%`,
  });
  return review;
}

// 入盒预检：换人复核两次，两次漏光均不高于 5%
export function 入盒预检(order) {
  const reasons = [];
  if (order.status !== 状态.待修边) reasons.push("只有待修边的检测单能入盒");
  const last2 = order.reviews.slice(-2);
  if (last2.length < 2) {
    reasons.push(`修边须换人复核两次，当前仅 ${order.reviews.length} 次`);
  } else {
    if (last2[0].reviewer === last2[1].reviewer) reasons.push("两次复核须换人");
    if (last2.some((r) => r.leakRatio > 入盒漏光上限)) {
      reasons.push(`两次复核漏光均须不高于 ${入盒漏光上限}%`);
    }
  }
  return { ok: reasons.length === 0, reasons, reviews: last2 };
}

export function 入盒(order, now = new Date().toISOString()) {
  const check = 入盒预检(order);
  if (!check.ok) throw new 业务错误(check.reasons.join("；"));
  order.status = 状态.已入盒;
  order.endedAt = now;
  order.history.push({
    at: now,
    step: "入盒",
    note: `两次换人复核（${check.reviews[0].reviewer}、${check.reviews[1].reviewer}）漏光均不高于 ${入盒漏光上限}%，准予入盒，检测单结束`,
  });
  return order;
}

// 补晒排队中的单子完成补晒，让出曝光位并入盒
export function 完成补晒(order, now = new Date().toISOString()) {
  if (order.status !== 状态.排队) throw new 业务错误("只有补晒排队中的检测单能完成补晒");
  order.status = 状态.已入盒;
  order.endedAt = now;
  order.history.push({ at: now, step: "完成补晒", note: "补晒完成，让出曝光位并入盒，检测单结束" });
  return order;
}

// 统计、队列与列表全部由同一份 orders 派生，保证刷新后一致
export function 统计(orders) {
  const s = { 全部: orders.length, 未结束: 0, 补晒排队: 0, 待修边: 0, 已入盒: 0 };
  for (const o of orders) {
    if (o.status === 状态.已入盒) {
      s.已入盒 += 1;
    } else {
      s.未结束 += 1;
      if (o.status === 状态.排队) s.补晒排队 += 1;
      else if (o.status === 状态.待修边) s.待修边 += 1;
    }
  }
  s.占用曝光位 = s.补晒排队;
  return s;
}

export function 曝光队列(orders) {
  return orders
    .filter((o) => o.status === 状态.排队)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((o, i) => ({
      position: i + 1,
      id: o.id,
      code: o.code,
      maskBatch: o.maskBatch,
      resunSeconds: o.resunSeconds,
      inspector: o.inspector,
      conclusionVersion: o.conclusion.version,
    }));
}
