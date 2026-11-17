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

export function roleIconUrl(role, grimoire) {
  if (!role || !role.id) return "";
  const imageOptIn = !grimoire || grimoire.isImageOptIn;
  // JSON 里原本提供的图片（仅在「允许自定义图标」打开时使用）
  const jsonImage = role.image && imageOptIn ? role.image : "";

  if (grimoire && grimoire.forceWikiIcon) {
    const wiki = lookupWiki(grimoire.wikiIcons, role);
    // 优先级：图床直链 → 剧本 JSON 里的 image → 内置图标（内置图标可能只是 good/evil 通用占位）
    const hit = firstOk([wiki, jsonImage]);
    if (hit) return hit;
    return localIcon(role);
  }

  const hit = firstOk([jsonImage]);
  if (hit) return hit;
  return localIcon(role);
}

export default roleIconUrl;
