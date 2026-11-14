/**
 * 快捷唤醒短语。
 *
 * 一条短语由 `seg` 描述：字符串是固定文字，对象是「说书人现场要填的空」。
 * 空位的类型只有四种，展示时各自渲染成不同样子：
 *   role  → 一张角色牌（圆牌 + 名字）
 *   align → 善良 / 邪恶 两个大字
 *   num   → 一个圈起来的数字
 *   seat  → 一个座位号
 *
 * `optional: true` 表示这一格可以不填，留空时整段话照样成立
 *（「对你生效」的第二个角色就是可选的）。
 */
export const QUICK_PHRASES = [
  {
    // 座位号可选：不选就是「这名玩家是…」，选了就是「这名5号玩家是…」
    key: "player-is-role",
    seg: ["这名", { seat: "s1" }, "是", { role: "r1" }],
    slots: [
      { key: "s1", type: "seat", optional: true },
      { key: "r1", type: "role" }
    ],
    // 打开时默认进角色选择（座位号是可选的附加信息）
    firstSlot: "r1"
  },
  {
    key: "roles-not-in-play",
    seg: ["这些角色不在场", { role: "r1" }, { role: "r2" }, { role: "r3" }],
    slots: [
      { key: "r1", type: "role" },
      { key: "r2", type: "role" },
      { key: "r3", type: "role" }
    ],
    // 这句话本来就是给「不在场」的角色用的，候选默认只看没上场的
    onlyUnused: true
  },
  {
    key: "this-role",
    seg: [{ role: "r1" }],
    slots: [{ key: "r1", type: "role" }]
  },
  {
    key: "affects-you",
    seg: ["对你生效", { role: "r1" }, { role: "r2" }],
    slots: [
      { key: "r1", type: "role" },
      { key: "r2", type: "role", optional: true }
    ]
  },
  {
    key: "use-ability",
    seg: ["是否使用你的能力"],
    slots: []
  },
  {
    // 阵营、角色两格都可留空，说书人填任意一格或两格都行：
    //   两格 → 你是善良的占卜师 ／ 只填阵营 → 你是善良的 ／ 只填角色 → 你是占卜师
    // 「的」挂在阵营空位上（suffix），阵营没填时不会出现「你是的占卜师」
    key: "you-are-align",
    seg: ["你是", { align: "a1", suffix: "的" }, { role: "r1" }],
    slots: [
      { key: "a1", type: "align", optional: true },
      { key: "r1", type: "role", optional: true }
    ],
    // 两格都可不填，但至少要填一格才能展示
    minFilled: 1,
    // 打开填空窗口时先选角色
    firstSlot: "r1"
  },
  {
    // 数字默认 1（打开就是「选择1名玩家」，不改直接展示）
    key: "choose-n",
    seg: ["选择", { num: "n1" }, "名玩家"],
    slots: [{ key: "n1", type: "num", default: 1 }]
  },
  {
    key: "make-choice",
    seg: ["做出你的选择"],
    slots: []
  }
];

/** 一个 seg 是不是空位 */
export function isSlot(seg) {
  return !!seg && typeof seg === "object";
}

/** 空位属于哪一类（role / align / num / seat） */
export function slotType(seg) {
  if (!isSlot(seg)) return "";
  if (seg.role) return "role";
  if (seg.align) return "align";
  if (seg.num) return "num";
  if (seg.seat) return "seat";
  return "";
}

/** 空位的键名，用来在 picked 里查值 */
export function slotKey(seg) {
  return seg.role || seg.align || seg.num || seg.seat || "";
}

/** 按 key 找空位定义（含 optional 标记） */
export function slotDef(phrase, key) {
  return (phrase.slots || []).find(item => item.key === key) || null;
}

/** 列表里给空位画小标签用的文字 */
export function slotLabel(type) {
  if (type === "role") return "角色";
  if (type === "align") return "善良 / 邪恶";
  if (type === "num") return "数字";
  // 座位号没选时这句话读作「这名玩家是…」
  if (type === "seat") return "玩家";
  return "?";
}

export const ALIGN_LABEL = { good: "善良", evil: "邪恶" };
export const ALIGN_TEAM = { good: "townsfolk", evil: "minion" };
