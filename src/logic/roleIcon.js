// 角色图标解析统一出口
//
// 背景：剧本 JSON 里的 role.image 可能是任意外链（甚至木马剧本用来追踪 IP 的地址），
// 因此提供「角色图标强制加载」开关：勾选后不再信任 role.image，
// 改用钟楼剧本博物馆 BWIKI 图床里为该角色上传的照片直链（映射由后端 /api/wiki-icons 下发）。
//
// 未开启时保持原有行为：role.image（且「允许自定义图标」打开）→ 内置图标。

const iconsCtx = require.context("../assets/icons", false, /\.png$/);
const localIconKeys = new Set(iconsCtx.keys());

// ---------------------------------------------------------------------------
// 图床直链的可用性探测
//
// 图床里偶尔会有文件已被删除/改名，映射表里仍留着旧链接。
// 这里用 new Image() 预加载一次：加载失败就记为 bad，并通知已挂载的组件重新渲染，
// 让它们改用 JSON 里原本提供的 image（或内置图标）兜底。
// ---------------------------------------------------------------------------

const iconStatus = new Map(); // url -> "checking" | "ok" | "bad"
const statusListeners = new Set();

// 订阅加载结果变化；返回取消订阅函数
export function subscribeIconStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function setStatus(url, status) {
  if (iconStatus.get(url) === status) return;
  iconStatus.set(url, status);
  statusListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      /* 单个订阅者出错不影响其它图标 */
    }
  });
}

// 返回当前已知状态，未知则发起一次探测（"checking"）
function probe(url) {
  const known = iconStatus.get(url);
  if (known) return known;
  iconStatus.set(url, "checking");
  const img = new Image();
  img.onload = () => setStatus(url, "ok");
  img.onerror = () => setStatus(url, "bad");
  img.src = url;
  return "checking";
}

// 在 wiki 映射里按角色名称查找直链；兼容「同名（旧）」后缀
// 以及 wiki 里常见的变体命名：`角色（版本）`、`阵营_角色_版本`
function lookupWiki(map, role) {
  if (!map) return "";
  const name = String((role && role.name) || "").trim();
  if (!name) return "";

  const candidates = [name];
  const base = name.replace(/[（(]旧[)）]$/, "").trim();
  if (base && base !== name) candidates.push(base);

  for (const n of candidates) {
    if (map[n]) return map[n];
  }

  // 宽松匹配：优先「角色名（版本）」这种同名变体，其次才是「阵营_角色名_版本」
  // 同类里多个变体时按名称排序取最靠前的一个
  // （与 wiki 角色列表的默认先后一致：如「猎巫人（万象星启）」排在「猎巫人（象牙塔）」之前）
  let best = "";
  for (const n of candidates) {
    if (!n) continue;
    const prefixCn = n + "（";
    const prefixEn = n + "(";
    for (const key in map) {
      if (key.startsWith(prefixCn) || key.startsWith(prefixEn)) {
        if (!best || key.localeCompare(best, "zh") < 0) best = key;
      }
    }
  }
  if (best) return map[best];

  for (const n of candidates) {
    if (!n) continue;
    const mid = "_" + n + "_";
    for (const key in map) {
      if (key.indexOf(mid) >= 0) {
        if (!best || key.localeCompare(best, "zh") < 0) best = key;
      }
    }
  }
  return best ? map[best] : "";
}

// ---------------------------------------------------------------------------
// 7uuu.me 统一图床（script_tool/hosted-icons）
//
// 数据来自 https://7uuu.me/script_tool/assets/script-tool/data.js 里的全局变量
// HOSTED_ROLE_ICONS（约 595 条，键 = 角色 id，值 = hosted-icons 直链）。
// 该文件是普通 JS，用 <script> 引入即可读到全局变量（不受 CORS 限制），
// 图床本身也不校验 Referer，因此不需要任何服务端代理。
// ---------------------------------------------------------------------------

const HOSTED_ICONS_SRC = "https://7uuu.me/script_tool/assets/script-tool/data.js";

let hostedPromise = null;
const hostedByKey = new Map(); // 归一化后的角色 id -> 直链
const hostedByName = new Map(); // 归一化后的中文角色名 -> 直链（优先使用）

// 同一角色在两边可能只是书写方式不同：7uuu 用 `fortune_teller_gstone` / `lil_monsta_gstone`，
// 我们用 `fortuneteller` / `lilmonstaold1`。这里只做「拼写归一化」判等，不做模糊匹配。
function normalizeRoleId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_gstone$/, "")
    .replace(/[^a-z0-9]/g, "");
}

// 中文名归一化：去空白、全角转半角、去「（旧）」后缀、小写
function normalizeRoleName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/（旧）/g, "")
    .replace(/\(旧\)/g, "")
    .toLowerCase();
}

// nameSource：id -> { n: 中文名 } 的字典（7uuu 的 SCRIPT_NIGHT_ORDER / CHARS）
function buildHostedIndex(raw, nameSources) {
  hostedByKey.clear();
  hostedByName.clear();
  // 允许传入数组形式的角色表（如 7uuu 的 CHARS：每项含 id / n），统一转成 id -> { n }
  const sources = (nameSources || []).map(src => {
    if (Array.isArray(src)) {
      const map = {};
      src.forEach(item => {
        if (item && item.id && item.n) map[item.id] = { n: item.n };
      });
      return map;
    }
    return src || {};
  });
  const nameOf = key => {
    for (const src of sources) {
      const rec = src && src[key];
      if (rec && rec.n) return rec.n;
    }
    return "";
  };
  Object.keys(raw || {}).forEach(key => {
    const url = raw[key];
    if (!url) return;
    // 1) 中文名索引（优先）
    const name = nameOf(key);
    const normName = normalizeRoleName(name);
    if (normName && !hostedByName.has(normName)) {
      hostedByName.set(normName, url);
    }
    // 2) 角色 id 索引（兜底）
    const normalized = normalizeRoleId(key);
    if (normalized && !hostedByKey.has(normalized)) {
      hostedByKey.set(normalized, url);
    }
  });
}

function notifyIconStatus() {
  statusListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      /* 单个订阅者出错不影响其它图标 */
    }
  });
}

// 懒加载一次 7uuu 的角色图床映射（失败可在下次调用时重试）
export function loadHostedIcons() {
  if (hostedPromise) return hostedPromise;
  hostedPromise = new Promise(resolve => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    if (window.HOSTED_ROLE_ICONS) {
      buildHostedIndex(window.HOSTED_ROLE_ICONS, [
        window.SCRIPT_NIGHT_ORDER,
        window.CHARS
      ]);
      notifyIconStatus();
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = HOSTED_ICONS_SRC;
    script.async = true;
    script.onload = () => {
      if (window.HOSTED_ROLE_ICONS) {
        buildHostedIndex(window.HOSTED_ROLE_ICONS, [
        window.SCRIPT_NIGHT_ORDER,
        window.CHARS
      ]);
        notifyIconStatus();
        resolve(true);
      } else {
        hostedPromise = null;
        resolve(false);
      }
    };
    script.onerror = () => {
      hostedPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return hostedPromise;
}

// 在 7uuu 图床里查直链：**先按中文名**，名字匹配不上再按角色 id（命中不了返回空串，交给后面的兜底来源）
export function hostedIconUrl(role) {
  if (!role) return "";
  // 1) 中文名优先（7uuu 的 id 体系与我们不同，名字才是可靠的关联键）
  const names = [];
  const rawName = String(role.name || "").trim();
  if (rawName) {
    names.push(rawName);
    // 「船长（山海百绘）」这类带括注的，再试去掉括注的主名
    const base = rawName.replace(/（[^）]*）|\([^)]*\)/g, "").trim();
    if (base && base !== rawName) names.push(base);
  }
  for (const n of names) {
    const hit = hostedByName.get(normalizeRoleName(n));
    if (hit) return hit;
  }
  // 2) 角色 id 兜底
  if (!role.id) return "";
  const id = String(role.id);
  const direct = hostedByKey.get(normalizeRoleId(id));
  if (direct) return direct;
  const withoutOld = id.replace(/old\d+$/, "");
  return hostedByKey.get(normalizeRoleId(withoutOld)) || "";
}

// 内置图标：imageAlt 或去掉 old1 后缀的角色 id，缺失则返回空串（不抛错）
function localIcon(role) {
  const id = role.imageAlt || String(role.id || "").replace(/old1$/, "");
  if (!id) return "";
  const key = "./" + id + ".png";
  return localIconKeys.has(key) ? iconsCtx(key) : "";
}

// 依次返回第一个“没有确认加载失败”的地址（"checking" 也算可用，失败后会自动重渲染再换下一个）
function firstOk(list) {
  for (const url of list) {
    if (url && probe(url) !== "bad") return url;
  }
  return "";
}

// 标记（reminder / 说书人 token）的图标：
// 标记里的 role 是角色 id（不是名字），需要先按 id 从 roles 表里取出角色，
// 才能在图床映射里查到该角色对应的直链。
export function reminderIconUrl(reminder, grimoire, roles) {
  if (!reminder) return "";
  const imageOptIn = !grimoire || grimoire.isImageOptIn;
  const jsonImage = reminder.image && imageOptIn ? reminder.image : "";
  const roleId = String(reminder.role || "");
  const role =
    roles && typeof roles.get === "function" ? roles.get(roleId) : null;

  if (grimoire && grimoire.forceWikiIcon) {
    loadHostedIcons();
    const hosted = role ? hostedIconUrl(role) : "";
    const wiki = role ? lookupWiki(grimoire.wikiIcons, role) : "";
    const hit = firstOk([hosted, wiki, jsonImage]);
    if (hit) return hit;
    return localIcon({ id: roleId, imageAlt: reminder.imageAlt });
  }

  const hit = firstOk([jsonImage]);
  if (hit) return hit;
  return localIcon({ id: roleId, imageAlt: reminder.imageAlt });
}

export function roleIconUrl(role, grimoire) {
  if (!role || !role.id) return "";
  const imageOptIn = !grimoire || grimoire.isImageOptIn;
  // JSON 里原本提供的图片（仅在「允许自定义图标」打开时使用）
  const jsonImage = role.image && imageOptIn ? role.image : "";

  if (grimoire && grimoire.forceWikiIcon) {
    loadHostedIcons();
    const hosted = hostedIconUrl(role);
    const wiki = lookupWiki(grimoire.wikiIcons, role);
    // 优先级：7uuu 统一图床 → BWIKI 图床 → 剧本 JSON 里的 image → 内置图标
    const hit = firstOk([hosted, wiki, jsonImage]);
    if (hit) return hit;
    return localIcon(role);
  }

  const hit = firstOk([jsonImage]);
  if (hit) return hit;
  return localIcon(role);
}

export default roleIconUrl;
