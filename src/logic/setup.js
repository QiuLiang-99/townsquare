/**
 * 两层分离：设置调整（Setup）与认知覆盖（Perception）
 *
 * 第一层 · 设置调整：只改「人数」。
 *   男爵 +2 外来者、卡扎力移除全部爪牙……它回答的是"每个阵营该发几张牌"。
 *
 * 第二层 · 认知覆盖：改的是「谁在场上、他以为自己是谁」。
 *   酒鬼、疯子、提线木偶——它们拿到的牌面属于另一个阵营，玩家看到的不是自己。
 *
 * 两层互不越界：设置调整永远不碰伪装牌，认知覆盖永远不靠"某阵营 −1"去随便删牌。
 *
 * ── 怎么识别：不维护角色名白名单 ──
 *   1. 角色属于哪个阵营，直接读剧本 JSON 的 `team` 字段，不靠名字猜。
 *   2. 设置调整：从能力文本里抓「数字 + 阵营」。优先读方括号约定
 *      （[+2 外来者]、[外来者 -3~+3]、[由你决定谁是什么爪牙] 等）；
 *      没有方括号时读全文，但要求附近出现「增加/额外/减少/移除」这类词，
 *      免得把「如果有 2 名外来者在场」误读成 +2。
 *   3. 认知覆盖：抓「你以为你是 X」「你不知道你是 X」这类**自述**句式。
 *      只看主语是自己的句子——「恶魔会以为你是爪牙」不算。
 *   这样剧本里冒出表外的新角色，只要文案是这几种写法就能自动认出来。
 *
 * 取值规则：调整有多个可能方向时，统一取区间的**左值**。
 */

export const TEAM_CN = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔"
};

export const TEAMS = ["townsfolk", "outsider", "minion", "demon"];

/** 第一层效果签名：区间用 [左值, 右值] 表示，实际结算取左值 */
const S = cfg => ({
  outsider: null,
  minion: null,
  demon: null,
  clearMinion: false, // 移除全部爪牙（如"由你决定谁是什么爪牙"）
  note: "",
  special: false, // 人数模型表达不了，只能提示说书人手工处理
  ...cfg
});

/* ──────────────────────────────────────────────────────────────
 * 下面这几张是「写法表」而不是「角色表」：
 * 它们描述中文里怎么表达阵营、怎么表达增减，与具体是哪个角色无关。
 * ────────────────────────────────────────────────────────────── */

/** 阵营的各种写法 */
const TEAM_WORDS = [
  ["townsfolk", /镇民|村民|好人/],
  ["outsider", /外来者|外地人/],
  ["minion", /爪牙|仆从/],
  ["demon", /恶魔|魔王/]
];

const teamOf = cn => Object.keys(TEAM_CN).find(t => TEAM_CN[t] === cn);
const toNum = s => parseInt(String(s).replace(/[＋]/g, "+").replace(/[−]/g, "-"), 10);

/* ── 第一层：设置调整 ── */

const BRACKET = /[[【（(]([^\]】）)]*)[\]】）)]/g;
/** 数字在前：`+2 外来者`、`+0~1 外来者` */
const NUM_BEFORE = /([+＋\-−]?\s*\d+)\s*(?:[~～至]\s*([+＋\-−]?\s*\d+))?\s*(?:个|名|位)?\s*(外来者|镇民|爪牙|恶魔)/g;
/** 阵营在前：`外来者 -3~+3`、`外来者 +2` */
const TEAM_BEFORE = /(外来者|镇民|爪牙|恶魔)\s*(?:的?数量)?\s*([+＋\-−]?\s*\d+)\s*(?:[~～至]\s*([+＋\-−]?\s*\d+))?/g;
const ANY_OUTSIDER = /任意数量\s*外来者?/;
/**
 * 「爪牙清零」必须是一个**动作句**：要么说书人指定谁是什么爪牙（卡扎力），
 * 要么明写移除 / 不在场。
 *
 * 绝对不能只看「所有爪牙」四个字就清零 —— 落难少女的
 * 「所有爪牙都知道落难少女在场」只是知情，跟配比毫无关系。
 * 同理「任意爪牙可以公开猜测」里的「任意爪牙」也不是数量。
 */
const CLEAR_MINION = [
  /由你决定谁是什么爪牙/,
  /(?:移除|去掉|清除|撤掉|替换|换掉)(?:掉)?\s*(?:所有|全部)?\s*爪牙/,
  /(?:所有|全部)\s*爪牙\s*(?:都|均)?\s*(?:被)?\s*(?:移除|离场|不在场|出局|变成|替换|改为|消失)/,
  /没有(?:任何)?\s*爪牙/
];
const clearMinionHit = text => CLEAR_MINION.some(re => re.test(text));
/** 全文模式下必须出现的「增减」意味词 */
const DELTA_VERB = /增加|额外|多出|减少|移除|少了|多了/;
/** 只有爪牙 / 恶魔的设置调整才会清空爪牙阵营 */
const CAN_CLEAR_MINION = ["minion", "demon"];
/** 这些词出现的「任意数量外来者」是在讲玩法选择，不是开局配比 */
const ACTIVE_CHOICE = /选择|猜测|投票|指定|提名/;

function contextHasVerb(text, index, len) {
  const from = Math.max(0, index - 14);
  const to = Math.min(text.length, index + len + 8);
  return DELTA_VERB.test(text.slice(from, to));
}

/** 带正负号的数字本身就说明了增减，不必再找动词 */
const isSigned = s => /[+＋\-−]/.test(String(s || ""));

/**
 * 从一段文本里读出配比调整。
 * @param {string} text
 * @param {boolean} loose true = 全文模式，要求附近有增减词；false = 方括号模式，作者已显式约定
 * @returns {object|null}
 */
function scanRange(text, loose) {
  const eff = S({});
  let hit = false;
  const put = (a, b, cn) => {
    const team = teamOf(cn);
    if (!team || team === "townsfolk") return; // 镇民是余数，自动反向补齐
    if (Number.isNaN(a) || Number.isNaN(b)) return;
    eff[team] = [Math.min(a, b), Math.max(a, b)];
    hit = true;
  };

  for (const m of text.matchAll(NUM_BEFORE)) {
    const explicit = isSigned(m[1]) || isSigned(m[2]);
    if (loose && !explicit && !contextHasVerb(text, m.index, m[0].length)) continue;
    put(toNum(m[1]), m[2] ? toNum(m[2]) : toNum(m[1]), m[3]);
  }
  for (const m of text.matchAll(TEAM_BEFORE)) {
    const explicit = isSigned(m[2]) || isSigned(m[3]);
    if (loose && !explicit && !contextHasVerb(text, m.index, m[0].length)) continue;
    put(toNum(m[2]), m[3] ? toNum(m[3]) : toNum(m[2]), m[1]);
  }
  if (ANY_OUTSIDER.test(text) && (!loose || !ACTIVE_CHOICE.test(text))) {
    eff.outsider = [-1, 3]; // 「任意数量」按左值取 -1
    hit = true;
  }
  if (clearMinionHit(text)) {
    eff.clearMinion = true;
    hit = true;
  }
  return hit ? eff : null;
}

/**
 * 收口：把「这个阵营根本不该有的效果」去掉，并保证至少还剩一个真效果。
 * 例：外来者 / 镇民角色提到「所有爪牙…」时，绝不允许它去清空爪牙阵营。
 */
function sanitize(eff, role) {
  if (!eff) return null;
  if (eff.clearMinion && !CAN_CLEAR_MINION.includes(role.team)) {
    eff.clearMinion = false;
  }
  const real = !!(eff.clearMinion || eff.outsider || eff.minion || eff.demon);
  return real ? eff : null;
}

/** 第一层：这个角色带来的设置调整（只改人数）；没有则 null */
export function setupEffectOf(role) {
  if (!role || !TEAMS.includes(role.team)) return null; // 旅行者 / 传说角色不参与配比
  if (perceptionOf(role)) return null; // 认知覆盖归第二层，别重复扣人

  const text = String(role.ability || "");

  // ① 方括号段：作者显式写明的配比约定，置信最高
  for (const m of text.matchAll(BRACKET)) {
    const eff = sanitize(scanRange(m[1], false), role);
    if (eff) return eff;
  }
  // ② 全文：必须带上「增加/额外/减少/移除」这类词，否则一个字都不动
  const loose = sanitize(scanRange(text, true), role);
  if (loose) return loose;
  // ③ 剧本标了 setup、文案又提到阵营，却读不出数值：交给人判断，绝不瞎猜
  if (role.setup === true && /外来者|镇民|爪牙|恶魔/.test(text)) {
    return S({
      note: "剧本标了设置调整，但能力文本里没读出具体数值，请手动核对",
      special: true
    });
  }
  return null;
}

/* ── 第二层：认知覆盖 ── */

/**
 * 「自己以为自己是别人」的句式。
 * 主语限定在自己身上，所以「恶魔会以为你是爪牙」「其他玩家以为你是…」
 * 这类给别人错觉的句子不会被命中。
 */
const SELF_PERCEIVE = [
  /你以为你(?:是|就是)\s*(?:一个|一名|一位|个|名|位)?\s*([^。．；;，,\n]{1,24})/g,
  /你(?:并)?不(?:知道|记得|晓得)你(?:其实是|原本是|是)\s*(?:一个|一名|一位|个|名|位)?\s*([^。．；;，,\n]{1,24})/g,
  /你(?:觉得|认为)你(?:是|就是)\s*(?:一个|一名|一位|个|名|位)?\s*([^。．；;，,\n]{1,24})/g,
  /you (?:think|believe) you are (?:a |an )?([a-z ]{3,24})/gi
];

/** 从「一个镇民角色」「一个善良角色」「一个恶魔」这样的短语里读出阵营 */
function teamFromWords(seg) {
  for (const [team, re] of TEAM_WORDS) if (re.test(seg)) return team;
  if (/善良|好人|正义/.test(seg)) return "townsfolk"; // 提线木偶：以为自己是「善良角色」
  if (/邪恶/.test(seg)) return "minion";
  return null;
}

/** 第二层：这个角色是不是认知覆盖；是则返回规则描述 */
export function perceptionOf(role) {
  if (!role || !TEAMS.includes(role.team)) return null;
  const own = role.team;
  for (const re of SELF_PERCEIVE) {
    for (const m of String(role.ability || "").matchAll(re)) {
      const team = teamFromWords(m[1] || "");
      if (team && team !== own) {
        return {
          own,
          replaceWith: team,
          detach: true,
          post: `${role.name} 会以为自己就是那张${TEAM_CN[team]}牌`
        };
      }
    }
  }
  return null;
}

/** 兼容旧调用：只看第一层 */
export const isSetupRole = role => !!setupEffectOf(role);
/** 只看第二层 */
export const isPerceptionRole = role => !!perceptionOf(role);

const signed = n => (n > 0 ? `+${n}` : String(n));
const plus = n => (n > 0 ? `+${n}` : String(n));

/** 调整有多个方向时统一取左值 */
export const applyValue = range => (range ? range[0] : 0);

/** 一句话说明这个角色实际带来的调整（用于提示条 / 结算回执，同样只写生效值） */
export function effectLabel(eff) {
  if (!eff) return "";
  const parts = [];
  if (eff.clearMinion) parts.push("爪牙清零");
  if (eff.outsider) parts.push(`外来者 ${signed(applyValue(eff.outsider))}`);
  if (eff.minion) parts.push(`爪牙 ${signed(applyValue(eff.minion))}`);
  if (eff.demon) parts.push(`恶魔 ${signed(applyValue(eff.demon))}`);
  if (eff.note) parts.push(eff.note);
  return parts.join("，");
}

/**
 * 角色右上角的小字（角标）：只写**这次真正生效的那个数**。
 * 区间型（限 −3~+3、教父 ±1、气球驾驶员 +0~1…）不再显示 "-3~+3" 这种让人无法对账的
 * 写法，统一写结算取用值，例如「外来者 -3」——和左侧计数圈的变化一一对应。
 * 取值范围 / "任意数量"这类规则说明放到 effectDetail() 里做悬停提示。
 */
export function deltaLabel(eff) {
  if (!eff) return "";
  const parts = [];
  if (eff.clearMinion) parts.push("爪牙清零");
  const each = (cn, range) => {
    if (!range) return;
    const v = applyValue(range);
    // 0 就是「不动人数」，写 ±0 比 +0 更不容易被误读成"加了 0 个人"
    parts.push(v === 0 ? `${cn} ±0` : `${cn} ${signed(v)}`);
  };
  each(TEAM_CN.outsider, eff.outsider);
  each(TEAM_CN.minion, eff.minion);
  each(TEAM_CN.demon, eff.demon);
  return parts.join("，");
}

/**
 * 角标的悬停说明：这个角色本来能调多少、这次取了哪个值。
 * 例：「外来者 可选 -3~+3，本次取 -3」「外来者 +2（固定）」「移除全部爪牙」
 */
export function effectDetail(eff) {
  if (!eff) return "";
  const bits = [];
  if (eff.clearMinion) bits.push("移除全部爪牙");
  const each = (cn, range) => {
    if (!range) return;
    const [a, b] = range;
    bits.push(
      a === b
        ? `${cn} ${signed(a)}（固定）`
        : `${cn} 可选 ${plus(a)}~${plus(b)}，本次取 ${signed(a)}`
    );
  };
  each(TEAM_CN.outsider, eff.outsider);
  each(TEAM_CN.minion, eff.minion);
  each(TEAM_CN.demon, eff.demon);
  if (eff.note) bits.push(eff.note);
  return bits.join("；");
}

/** 已勾选角色里属于第一层的 */
export function selectedSetupEffects(roles) {
  const out = [];
  const seen = new Set();
  (roles || []).forEach(role => {
    if (!role || !role.selected) return;
    const eff = setupEffectOf(role);
    if (!eff) return;
    const key = role.id || role.name;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ role, name: role.name, eff, text: effectLabel(eff) });
  });
  return out;
}

/** 已勾选角色里属于第二层的（含已被移出牌堆、但仍在场的） */
export function selectedPerceptions(roles) {
  const out = [];
  const seen = new Set();
  (roles || []).forEach(role => {
    if (!role || (!role.selected && !role.detached)) return;
    const spec = perceptionOf(role);
    if (!spec) return;
    const key = role.id || role.name;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      role,
      name: role.name,
      spec,
      detached: !role.selected,
      text: spec.replaceWith
        ? `留在${TEAM_CN[spec.own]}，拿一张${TEAM_CN[spec.replaceWith]}牌当伪装`
        : spec.post
    });
  });
  return out;
}

/**
 * 结算目标配比。
 * @param {Array} setupEffects 第一层（selectedSetupEffects）
 * @param {Array} perceptions  第二层（selectedPerceptions）
 * @param {number} playerCount 非旅行者人数
 * @param {Array} game         官方配比表
 * @param {number} outsiderPool 剧本里可用的外来者角色数（截断上限）
 */
export function computeTargets({
  setupEffects = [],
  perceptions = [],
  playerCount,
  game,
  outsiderPool = 99
}) {
  const idx = Math.min(Math.max(playerCount - 5, 0), (game || []).length - 1);
  const base = (game || [])[idx];
  if (!base) return { ok: false, error: "读取官方配比表失败" };

  const t = {
    townsfolk: base.townsfolk,
    outsider: base.outsider,
    minion: base.minion,
    demon: base.demon
  };
  const applied = [];

  // 第一层：人数加减（取左值）
  let clearMinion = false;
  setupEffects.forEach(({ name, eff }) => {
    const bits = [];
    if (eff.outsider) {
      const v = applyValue(eff.outsider);
      t.outsider += v;
      bits.push(`外来者 ${signed(v)}`);
    }
    if (eff.minion) {
      const v = applyValue(eff.minion);
      t.minion += v;
      bits.push(`爪牙 ${signed(v)}`);
    }
    if (eff.demon) {
      const v = applyValue(eff.demon);
      t.demon += v;
      bits.push(`恶魔 ${signed(v)}`);
    }
    if (eff.clearMinion) {
      clearMinion = true;
    }
    if (eff.note) bits.push(eff.note);
    applied.push({ name, text: bits.join("，") || "需人工确认" });
  });
  if (clearMinion) t.minion = 0;
  t.minion = Math.max(0, t.minion);
  t.demon = Math.max(0, t.demon);

  /**
   * 先按剧本可用外来者数量截断「设置调整」的结果，再叠加认知覆盖。
   *
   * 顺序很关键：认知覆盖要到袋里拿一张别的阵营的牌当伪装牌，这是硬需求。
   * 如果先叠加再 clamp（旧写法），「限 −3 把外来者减到 0」会把悟道者好不容易
   * +1 出来的那一张外来者伪装牌一起 clamp 掉，于是出现
   * 「外来者目标 0，却又必须发 1 张外来者伪装牌」→ 目标 0 但已选 1 → 无法分配。
   */
  const capPool = Math.max(0, outsiderPool);
  const rawOutsider = t.outsider;
  const capped = Math.min(Math.max(rawOutsider, 0), capPool);
  const clamped = capped !== rawOutsider;
  // 截断方向：low = 被减到不够（负向调整没兑现），high = 超出剧本可用张数
  const clampDir = clamped ? (rawOutsider <= 0 ? "low" : "high") : null;
  t.outsider = capped;

  const warnings = [];

  /**
   * 第二层：认知覆盖 —— **不改人数，也不占额外座位**。
   *
   * 酒鬼是外来者、提线木偶是爪牙，它们坐在自己阵营已有的名额里；
   * 所谓「伪装牌」只是它这张牌的面孔（拿一张**没上场**的同阵营/替换阵营牌顶替），
   * 发牌时替换掉它自己那一张，袋里因此仍是 playerCount 张，不会多出一张。
   * 所以这里绝不能给替换阵营 +1，也绝不能给阵营收紧之外的任何回填。
   *
   * 由此得出唯一自洽的结论：**设置调整说了算**。
   * 「限 −3」把外来者减到 0，就是 0 个外来者，酒鬼没有位置站，只能下场；
   * 如果这里给它「保底留 1 个」，限就永远减不到 0，两层规则互相打架。
   */
  const unplaceable = [];
  const freeSlots = { townsfolk: t.townsfolk, outsider: t.outsider, minion: t.minion, demon: t.demon };
  perceptions.forEach(({ role, name, spec }) => {
    if (!spec || !spec.replaceWith || !spec.detach) return;
    if ((freeSlots[spec.own] || 0) > 0) {
      freeSlots[spec.own] -= 1; // 占掉自己阵营的一个名额
    } else {
      unplaceable.push({ id: role.id, name, team: spec.own });
      warnings.push(
        `${TEAM_CN[spec.own]}已被减到 ${t[spec.own]} 个，${name} 没有位置，本次不进入牌堆`
      );
    }
  });

  perceptions.forEach(({ role, name, spec }) => {
    if (!spec || !spec.replaceWith || !spec.detach) {
      applied.push({ name, text: "认知覆盖，不改人数" });
      return;
    }
    const blocked = unplaceable.some(item => String(item.id) === String(role.id));
    applied.push({
      name,
      text: blocked
        ? `${TEAM_CN[spec.own]}名额已为 0，无法在场（已取消勾选）`
        : `留在${TEAM_CN[spec.own]}，拿一张${TEAM_CN[spec.replaceWith]}牌当伪装（不额外占人数）`
    });
  });

  t.minion = Math.max(0, t.minion);
  t.demon = Math.max(0, t.demon);
  t.outsider = Math.max(0, t.outsider);

  // 镇民是余数：总数必须等于玩家人数
  t.townsfolk = playerCount - t.outsider - t.minion - t.demon;

  if (t.townsfolk < 0) {
    return {
      ok: false,
      error: `按当前调整算出来镇民为 ${t.townsfolk}，剧本角色不够，请减少调整量或玩家人数`
    };
  }

  return { ok: true, clamped, clampDir, warnings, unplaceable, targets: t, applied };
}

export const compositionText = t => TEAMS.map(team => t[team]).join("/");
