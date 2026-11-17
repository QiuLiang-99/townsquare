// 提示标记（reminder）的自动清理逻辑
//
// 纸质魔典里，很多标记并不是挂在自己座位上的：僧侣的「保护」放在被保护的人身上、
// 占卜师的「干扰项」放在被查验的人身上。角色死亡 / 被换掉之后，这些牌还留在
// 别人脚下就是错的，所以清理必须**扫全场**，而不是只清自己那一格。
//
// 两条不能破的规则：
//   1. 只清「这个角色自己带来的」标记（item.role === role.id），
//      别的角色挂上来的标记（中毒、保护…）和人家的清单一律不动；
//   2. remindersGlobal（如酒鬼的「是酒鬼」）是身份信息，不清。

/** 这枚标记是不是「该角色自己带来的、且不属于 remindersGlobal」 */
export function isRoleLocalReminder(item, role) {
  if (!item || !role || !role.id) return false;
  if (String(item.role || "") !== String(role.id)) return false;
  const globalNames = Array.isArray(role.remindersGlobal) ? role.remindersGlobal : [];
  return !globalNames.includes(item.name);
}

/** 把标记列表拆成「留下的」和「该角色带来的」 */
export function splitRoleReminders(list, role) {
  const kept = [];
  const removed = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    if (isRoleLocalReminder(item, role)) removed.push(item);
    else kept.push(item);
  });
  return { kept, removed };
}

/**
 * 扫全场，把 role 带来的非全局标记摘下来。
 * 不直接改 store，返回每个座位的处理结果（含清理前的快照，供撤回用）：
 *   [{ index, name, items, prevReminders, prevStReminders }]
 */
export function sweepRoleReminders(players, role) {
  const groups = [];
  (Array.isArray(players) ? players : []).forEach((player, index) => {
    if (!player) return;
    const reminders = Array.isArray(player.reminders) ? player.reminders : [];
    const { removed } = splitRoleReminders(reminders, role);
    if (!removed.length) return;
    groups.push({
      index,
      name: player.name || `${index + 1}号`,
      items: removed,
      // 撤回用：原样存下清理前的两份列表
      prevReminders: reminders.slice(),
      prevStReminders: Array.isArray(player.stReminders) ? player.stReminders.slice() : []
    });
  });
  return groups;
}

/**
 * 扫全场 + 立刻写回 store（reminders / stReminders）。
 * @param {Object} store Vuex store
 * @param {Array} players 全场座位
 * @param {Object} role 要清理的角色
 * @returns 同 sweepRoleReminders，用于弹撤回条
 */
export function sweepAndCommit(store, players, role) {
  const groups = sweepRoleReminders(players, role);
  groups.forEach(group => {
    const player = players[group.index];
    if (!player) return;
    const { kept } = splitRoleReminders(
      Array.isArray(player.reminders) ? player.reminders : [],
      role
    );
    store.commit("players/update", {
      player,
      property: "reminders",
      value: kept
    });
    if (!store.state.session.isSpectator) {
      store.commit("players/update", {
        player,
        property: "stReminders",
        value: kept.filter(item => item.role !== "custom")
      });
    }
  });
  return groups;
}

/**
 * 把清理结果写成一句人话。
 * 别人座位上的标记要带上座位名，否则说书人不知道那张牌原本在哪。
 */
export function describeRemoved(groups, actorIndex) {
  return (Array.isArray(groups) ? groups : [])
    .map(group =>
      group.items
        .map(item =>
          Number(group.index) === Number(actorIndex) ? item.name : `${item.name}（${group.name}）`
        )
        .join("、")
    )
    .filter(Boolean)
    .join("、");
}

// ---------------------------------------------------------------------------
// 下面这块是原有功能：角色分配时「认知覆盖」座位要自动挂上的身份标记。
// （牌面是「占卜师」、背后其实是「酒鬼」时，把酒鬼的 remindersGlobal 挂上去）
// ---------------------------------------------------------------------------

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

export default sweepAndCommit;
