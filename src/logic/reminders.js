/**
 * 提示标记（token）数据来源 —— 精简版。
 *
 * 只保留 RolesModal 分配角色时真正要用的「认知覆盖身份标记」这一小块：
 * 牌面是「占卜师」、背后其实是「酒鬼」时，酒鬼的 remindersGlobal（如「是酒鬼」）
 * 应该自动挂到这个座位上，说书人不用自己再去找一遍。
 *
 * 标记面板（ReminderModal）用的那些组装 / 清理函数本仓库尚未移植，
 * 所以这里不搬，避免留下调用不到的死代码。
 */

/** 把角色定义里的一个名字包成可渲染的标记对象 */
export const toReminder = (role, name) => ({
  role: String((role && role.id) || "common"),
  roleName: (role && role.name) || "",
  name: String(name || "").trim(),
  image: (role && role.image) || "",
  imageAlt: (role && role.imageAlt) || "",
  team: (role && role.team) || ""
});

const globalNamesOf = role =>
  Array.isArray(role && role.remindersGlobal) ? role.remindersGlobal : [];

/**
 * 认知覆盖座位应该自动带的标记。
 * 牌面是「占卜师」、背后其实是「酒鬼」时，角色对象上挂着 role.coverOf = 酒鬼，
 * 真实身份的 remindersGlobal（酒鬼 → 「是酒鬼」）就该直接放进这个座位。
 *
 * @param {Object} role      发给玩家的那张牌（带 coverOf 标记）
 * @param {Map|Array} allRoles 当前剧本的全部角色（store.state.roles，通常是 Map）
 * @returns {Array} 要挂上去的标记对象数组
 */
export function identityReminders(role, allRoles) {
  const cover = role && role.coverOf;
  if (!cover || !cover.id) return [];
  let source = null;
  if (allRoles instanceof Map) {
    source = allRoles.get(String(cover.id)) || allRoles.get(cover.id) || null;
  } else if (Array.isArray(allRoles)) {
    source = allRoles.find(item => String(item.id) === String(cover.id)) || null;
  }
  if (!source) return [];
  return globalNamesOf(source).map(name => toReminder(source, name));
}
