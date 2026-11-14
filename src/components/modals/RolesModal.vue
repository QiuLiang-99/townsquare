<template>
  <Modal
    class="roles"
    v-if="modals.roles && nonTravelers >= 5"
    @close="toggleModal('roles')"
  >
    <h3>为当前{{ nonTravelers }}名玩家选择角色</h3>
    <ul class="tokens" v-for="(teamRoles, team) in roleSelection" :key="team" >
      <li
        class="count"
        :class="[team]"
        :title="`+ / − 调整${teamNames[team] || team}的目标人数（当前 ${targets[team]} 人）：点 + 会从没上场的角色里抽一张补进来，点 − 会把已上场的一张移下去；${
          team === 'townsfolk'
            ? '镇民是余数，加减会直接改总配比'
            : '人数差额由镇民对冲（+1 就镇民 −1，−1 就镇民 +1），总人数不变'
        }；骰子只随机该阵营`"
      >
        <div class="frac">
          {{ teamSelected(team) }}<span class="slash">/</span>{{ targets[team] }}
        </div>
        <div class="count-buttons">
          <font-awesome-icon
            icon="minus-circle"
            @click.stop="adjustTarget(team, -1)"
            :class="{ muted: !targets[team] }"
            :title="`${teamNames[team] || team} 目标 −1，并从已上场的角色里随机移走一张`"
          />
          <font-awesome-icon
            icon="plus-circle"
            @click.stop="adjustTarget(team, 1)"
            :title="`${teamNames[team] || team} 目标 +1，并从没上场的角色里随机抽一张`"
          />
          <font-awesome-icon
            class="dice"
            icon="dice"
            @click.stop="randomizeTeam(team)"
            :title="`只随机${teamNames[team] || team}（按当前目标 ${targets[team]} 人重抽）`"
          />
        </div>
      </li>
      <li
        v-for="role in teamRoles"
        :class="[role.team, role.selected ? 'selected' : '', role.coverOf && !role.selected ? 'is-cover' : '']"
        :key="role.id"
        @click="toggleRole(role)"
        :style="tokenWidth"
      >
        <Token :role="role" :tag="setupTag(role)" :tag-title="setupTagTitle(role)" />
        <font-awesome-icon icon="exclamation-triangle" v-if="role.setup" />
        <div class="buttons" v-if="allowMultiple">
          <font-awesome-icon
            icon="minus-circle"
            @click.stop="removeDuplicate(role)"
          />
          <span>{{ role.selected > 1 ? "x" + role.selected : "" }}</span>
          <font-awesome-icon
            icon="plus-circle"
            @click.stop="addDuplicate(role)"
          />
        </div>
      </li>
    </ul>

    <!-- 按所选角色的设置调整能力，一键重算四个阵营的目标人数 -->
    <div class="setupAdapt" v-if="hasAdjustment">
      <button
        class="adapt"
        @click="applySetupAdjustment"
        :title="setupPreview ? `按所选角色的调整结算，建议配比 ${setupPreview}` : '按所选角色的设置调整能力重算四个阵营的目标人数'"
      >
        <font-awesome-icon icon="sliders-h" />
        适应配置调整
        <small v-if="setupPreview">{{ setupPreview }}</small>
      </button>
    </div>

    <!-- 复盘视角警告：保留 -->
    <div class="warningReview" v-if="session.isReview">
      <font-awesome-icon icon="exclamation-triangle" />
      <span>
        警告: 正在使用复盘视角，如果即将进行游戏请先关闭复盘视角！
      </span>
    </div>

    <!-- 分配前置校验：左侧已选数量必须等于右侧目标数量，且目标总和必须等于玩家人数 -->
    <div class="validate" :class="{ ok: canAssign }">
      <template v-if="canAssign">
        <font-awesome-icon icon="check-square" />
        <span>配置有效：{{ selectedRoles }} 名玩家将获得角色，可以分配或抽取。</span>
      </template>
      <template v-else-if="!selectedRoles">
        <font-awesome-icon icon="exclamation-triangle" />
        <span>尚未选择角色，点右下角「随机角色」可一键生成一套配置。</span>
      </template>
      <template v-else-if="!isTotalMatched">
        <font-awesome-icon icon="exclamation-triangle" />
        <span>
          四类目标人数之和为 {{ targetTotal }}，应为 {{ nonTravelers }}
          （{{ targetsText }}）—— 请用 + / − 调整到总和相等。
        </span>
      </template>
      <template v-else>
        <font-awesome-icon icon="exclamation-triangle" />
        <span>{{ mismatchText }}</span>
      </template>
    </div>

    <label class="multiple" :class="{ checked: allowMultiple }">
      <font-awesome-icon :icon="allowMultiple ? 'check-square' : 'square'" />
      <input type="checkbox" name="allow-multiple" v-model="allowMultiple" />
      允许重复角色
    </label>
    <div class="button-group">
      <div
        class="button"
        @click="assignRoles(true)"
        :class="{
          disabled: !canAssign || (!allowReview && !canAssign)
        }"
      >
        <font-awesome-icon icon="exclamation-triangle" v-if="session.isReview" style="color: yellow;"/>
        <font-awesome-icon icon="people-arrows" v-else/>
        随机分配{{ selectedRoles }}个角色
      </div>
      <div v-if="session.isReview"
        class="button"
        @click="assignRoles(false)"
        :class="{ disabled: !canAssign }"
      >
        <font-awesome-icon icon="people-arrows" />
        关闭复盘并随机分配
      </div>
      <div
        class="button"
        @click="drawRoles()"
        :class="{ disabled: !canAssign }"
      >
        抽取角色（线下）
      </div>
      <div class="button" @click="selectRandomRoles(true)">
        <font-awesome-icon icon="random" />
        随机角色
      </div>
    </div>
  </Modal>
</template>

<script>
import Modal from "./Modal";
import gameJSON from "./../../game";
import Token from "./../Token";
import {
  TEAMS,
  TEAM_CN,
  setupEffectOf,
  perceptionOf,
  deltaLabel,
  effectDetail,
  applyValue,
  selectedSetupEffects,
  selectedPerceptions,
  computeTargets,
  compositionText
} from "./../../logic/setup";
import { mapGetters, mapMutations, mapState } from "vuex";

const randomElement = arr => arr[Math.floor(Math.random() * arr.length)];

export default {
  components: {
    Token,
    Modal
  },
  data: function() {
    return {
      roleSelection: {},
      game: gameJSON,
      allowMultiple: false,
      // 每个阵营的目标人数：默认取自官方人数配比表，可由左侧圆圈的 + / − 调整
      targets: {},
      // 外来者被剧本可用数量截断时记一笔，只标在"真的没兑现"的那类角色上
      clampInfo: { on: false, dir: null, actual: 0, pool: 0 },
      teamNames: {
        townsfolk: "镇民",
        outsider: "外来者",
        minion: "爪牙",
        demon: "恶魔"
      },
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      // 分配前是否允许"复盘视角"直接分配（原按钮语义保留）
      allowReview: true
    };
  },
  computed: {
    selectedRoles: function() {
      return Object.values(this.roleSelection)
        .map(roles => roles.reduce((a, { selected }) => a + selected, 0))
        .reduce((a, b) => a + b, 0);
    },
    targetTotal: function() {
      return Object.keys(this.targets).reduce(
        (a, team) => a + Number(this.targets[team] || 0),
        0
      );
    },
    isTotalMatched: function() {
      return this.targetTotal === this.nonTravelers;
    },
    /** 左侧已选数量与右侧目标数量不一致的阵营 */
    mismatchedTeams: function() {
      return Object.keys(this.roleSelection).filter(
        team => this.teamSelected(team) !== this.targets[team]
      );
    },
    mismatchText: function() {
      return (
        this.mismatchedTeams
          .map(team => {
            const selected = this.teamSelected(team);
            const target = this.targets[team];
            const diff = target - selected;
            return `${this.teamNames[team] || team} ${selected}/${target}${
              diff > 0 ? `（还差 ${diff}）` : `（超出 ${-diff}）`
            }`;
          })
          .join("、") + " —— 已选数量需与目标一致，否则无法分配。"
      );
    },
    isEachTeamMatched: function() {
      return this.mismatchedTeams.length === 0;
    },
    /** 三个按钮的统一可用条件：有选择、每个阵营左右相等、且目标总和等于玩家人数 */
    canAssign: function() {
      return (
        this.selectedRoles > 0 &&
        this.isEachTeamMatched &&
        this.isTotalMatched
      );
    },
    targetsText: function() {
      return Object.keys(this.targets)
        .map(team => `${this.teamNames[team] || team}${this.targets[team]}`)
        .join(" + ");
    },
    /** 当前已勾选的角色（含重复角色的数量展开前的原对象） */
    pickedRoles: function() {
      const picked = [];
      Object.keys(this.roleSelection).forEach(team => {
        (this.roleSelection[team] || []).forEach(role => {
          if (role.selected) picked.push(role);
        });
      });
      return picked;
    },
    /** 已勾选角色里带设置调整的那些（第一层：只改人数） */
    setupEffects: function() {
      return selectedSetupEffects(this.pickedRoles);
    },
    /** 已勾选角色里属于认知覆盖的那些（第二层：换成另一阵营的牌，含已移出牌堆的） */
    perceptions: function() {
      const all = [];
      Object.keys(this.roleSelection).forEach(team => {
        (this.roleSelection[team] || []).forEach(role => all.push(role));
      });
      return selectedPerceptions(all);
    },
    /**
     * 有真正的调整才显示「适应配置调整」按钮：
     * 只读到「剧本标了 setup 但没数值」这种提示时不算——那种情况按钮点了也不会改人数。
     */
    hasAdjustment: function() {
      const real = this.setupEffects.some(({ eff }) => {
        return !!(eff && (eff.clearMinion || eff.outsider || eff.minion || eff.demon));
      });
      return real || this.perceptions.length > 0;
    },
    /** 剧本里可用的外来者角色数：用来给"外来者 +N"设上限（认知覆盖角色自己也是一张外来者牌，计入） */
    outsiderPool: function() {
      if (this.allowMultiple) return 99;
      return (this.roleSelection.outsider || []).length;
    },
    /** 按当前选择结算出来的建议配比 */
    setupPreview: function() {
      if (!this.hasAdjustment) return "";
      const res = computeTargets({
        setupEffects: this.setupEffects,
        perceptions: this.perceptions,
        playerCount: this.nonTravelers,
        game: this.game,
        outsiderPool: this.outsiderPool
      });
      return res.ok ? compositionText(res.targets) : "";
    },
    tokenWidth() {
      /*
       * 源码是 `width = 0.06 * 窗口宽；>=80 用 6vw，否则 80px`。
       * 那个「否则 80px」在手机上就是灾难：390 宽里 80px 的牌一行只放得下 3 张，
       * 25 个角色要排 9 行，一屏永远看不完。
       * 这里换成一条连续的尺度：窄屏收到 56px、宽屏封顶 86px（和源码 6vw 在 1440 下一致），
       * 中间连续变化，没有断点，390 一行 4 张、1440 一行 8 张。
       */
      return "width: clamp(56px, 14vw, 86px)";
    },
    ...mapState(["roles", "modals", "session"]),
    ...mapState("players", ["players"]),
    ...mapGetters({ nonTravelers: "players/nonTravelers" })
  },
  methods: {
    /**
     * 点角色圆牌：勾选 / 取消。
     * 勾上就当场结算这张牌的设置调整（不用再点「适应配置调整」），
     * 是认知覆盖角色就当场给它挑一张伪装牌；取消则把调整撤销、伪装牌收回。
     */
    toggleRole(role) {
      if (role.selected) {
        role.selected = 0;
        this.onRoleRemoved(role);
      } else {
        // 名额已经满了：用这张新牌替换掉该阵营里随机一张旧牌
        this.makeRoomFor(role);
        role.selected = 1;
        // 手动把这张牌选上场了，它就不能再当别人的伪装牌
        if (role.coverOf) this.$delete(role, "coverOf");
        this.onRoleAdded(role);
      }
      if (role.detached) this.$delete(role, "detached");
    },
    /**
     * 加入新牌前先腾位置，保证「已选 / 目标」不会因为多点一张而失衡：
     *   已选 < 目标  → 还有空位，什么都不用做
     *   已选 = 目标  → 随机移走一张旧的（新牌顶替它），并提示换了谁
     *   目标为 0 且没有旧牌 → 把目标 +1（等价于点了一次 +），否则这张牌根本没位置
     * 「允许重复角色」下同样生效：那张牌是 x3 时只减 1 张，被抽中的概率按张数加权。
     * @param {Object} role 即将加入的牌
     * @param {Boolean} excludeSelf 给同名牌加张数时传 true，别把它自己当被替换对象
     */
    makeRoomFor(role, excludeSelf) {
      const team = role.team;
      if (this.targets[team] === undefined) return; // 旅行者等不在配比里的阵营，不限制
      const target = this.targets[team] || 0;
      if (this.teamSelected(team) < target) return; // 还有空位

      const roles = this.roleSelection[team] || [];
      // 按张数展开：x3 的角色被抽中的概率是 x1 的三倍；伪装牌（未上场）不参与
      const pool = [];
      roles.forEach(item => {
        if (!item.selected || item.coverOf) return;
        if (excludeSelf && String(item.id) === String(role.id)) return;
        for (let i = 0; i < item.selected; i++) pool.push(item);
      });
      const name = this.teamNames[team] || TEAM_CN[team] || team;

      if (pool.length) {
        const removed = pool[Math.floor(Math.random() * pool.length)];
        removed.selected = Math.max(0, removed.selected - 1);
        let tail = "";
        if (removed.selected) {
          // 重复角色：只移走其中一张，这张牌还在场上
          tail = `（「${removed.name}」还剩 ${removed.selected} 张）`;
        } else {
          // 这张牌彻底下场了：它那张伪装牌上的标记一起摘掉
          this.clearCoverOfRole(removed.id);
        }
        const verb = excludeSelf
          ? `给「${role.name}」加 1 张，替下「${removed.name}」`
          : `用「${role.name}」替换了「${removed.name}」`;
        this.$root.$emit("notify", `${name}已满 ${target} 个，${verb}${tail}。`, "ok");
        return;
      }

      // 场上没有别的牌可以替换（目标是 0，或只有这张牌自己）：腾一个新位置出来。
      // 位置从镇民那里拿——总人数不变，只是把镇民的一个座位换成了这张牌。
      this.$set(this.targets, team, target + 1);
      const buf = "townsfolk";
      const took = team !== buf ? this.nudgeTeam(buf, -1, { quiet: true }) : null;
      const from = took ? `（镇民 ${took.from} → ${took.to}，让出一个位置）` : "";
      this.$root.$emit(
        "notify",
        `${name}没有可替换的角色，已把目标改成 ${target + 1}${from}，给「${role.name}」腾出一个位置。`,
        "ok"
      );
    },
    /** 重复角色：给这张牌多加一张（满员时先替一张别的牌下来，不会把自己换掉） */
    addDuplicate(role) {
      this.makeRoomFor(role, true);
      role.selected++;
      // 第一次从 0 变 1 才算「新上场」，需要结算一次设置调整
      if (role.selected === 1) this.onRoleAdded(role);
    },
    /** 重复角色：减一张；减到 0 时才撤销它的设置调整、收回伪装牌 */
    removeDuplicate(role) {
      if (role.selected <= 0) return;
      role.selected--;
      if (!role.selected) this.onRoleRemoved(role);
    },
    teamSelected(team) {
      const roles = this.roleSelection[team];
      if (!roles) return 0;
      return roles.reduce((a, { selected }) => a + selected, 0);
    },
    /** 未上场的牌里随机取一张：伪装牌、已被移出牌堆的、被排除的那张都不算 */
    pickUnused(team, excludeId) {
      const roles = this.roleSelection[team] || [];
      const usable = roles.filter(
        role =>
          !role.selected &&
          !role.coverOf &&
          !role.detached &&
          String(role.id) !== String(excludeId || "")
      );
      if (!usable.length) return null;
      // 普通牌优先；只剩认知覆盖角色时才抽它（抽中后会立刻给它补一张伪装牌）
      const plain = usable.filter(role => !perceptionOf(role));
      return randomElement(plain.length ? plain : usable);
    },
    /** 已上场的牌里随机取一张移走：带设置调整 / 认知覆盖的牌放到最后才动，别把刚生效的规则抽走 */
    pickOnStage(team, excludeId) {
      const roles = this.roleSelection[team] || [];
      const onStage = roles.filter(role => role.selected);
      if (!onStage.length) return null;
      const tiers = [
        onStage.filter(role => !role.coverOf && !setupEffectOf(role) && !perceptionOf(role)),
        onStage.filter(role => !role.coverOf),
        onStage
      ];
      const pool = tiers.find(list => list.length) || [];
      const usable = pool.filter(role => String(role.id) !== String(excludeId || ""));
      return randomElement(usable.length ? usable : pool);
    },
    /**
     * 只动一个阵营：目标 ±delta，并真抽 / 真移同样张数的牌。
     * 抽不满时目标停在**已经兑现**的位置，绝不留下 3/4 这种对不上的半截状态。
     * @returns {{team, from, to, added: string[], removed: string[]}|null}
     */
    nudgeTeam(team, delta, opts = {}) {
      if (!delta || this.targets[team] === undefined) return null;
      const from = this.targets[team] || 0;
      let next = Math.max(0, Math.min(15, from + delta));
      // 外来者不可能多于剧本里可用的外来者牌（重复角色模式下不设这个上限）
      if (team === "outsider" && !this.allowMultiple) {
        next = Math.min(next, this.outsiderPool);
      }
      if (next === from) return null;

      const added = [];
      const removed = [];
      if (next > from) {
        while (from + added.length < next) {
          const role = this.pickUnused(team, opts.excludeId);
          if (!role) break;
          role.selected = 1;
          added.push(role.name);
        }
        if (!opts.allowEmpty) next = from + added.length;
      } else {
        const before = this.teamSelected(team);
        while (from - removed.length > next) {
          const role = this.pickOnStage(team, opts.excludeId);
          if (!role) break;
          role.selected = Math.max(0, role.selected - 1);
          // 重复角色只移走一张；这张牌彻底下场时，帮它保管的伪装牌标记一起摘掉
          if (!role.selected) {
            if (role.coverOf) this.$delete(role, "coverOf");
            this.clearCoverOfRole(role.id);
          }
          removed.push(role.name);
        }
        // 目标不能降到「已选张数」以下，否则又变成 2/1 这种分配不出去的状态
        if (!opts.allowEmpty && before <= from) {
          next = Math.max(next, this.teamSelected(team));
        }
      }
      if (next === from) return null;
      this.$set(this.targets, team, next);
      return { team, from, to: next, added, removed };
    },
    /**
     * 改一个阵营的目标，差额**由镇民吸收**（四类之和永远等于玩家人数）：
     *   外来者 / 爪牙 / 恶魔 +1 → 镇民 −1；−1 → 镇民 +1。
     * 这正是「设置调整」的语义：调整只搬座位，不造座位。
     * @param {String} team 目标阵营
     * @param {Number} delta 正负整数
     * @param {Object} opts { excludeId 别动这张牌, quiet 不弹提示 }
     * @returns {{pairs: Array<{team,from,to}>, added: string[], removed: string[]}|null}
     */
    shiftTarget(team, delta, opts = {}) {
      if (!delta || this.targets[team] === undefined) return null;
      const buf = "townsfolk";
      const name = this.teamNames[team] || TEAM_CN[team] || team;

      if (team === buf) {
        const r = this.nudgeTeam(buf, delta, opts);
        if (!r) return null;
        this.ensureCovers();
        return {
          pairs: [{ team: r.team, from: r.from, to: r.to }],
          added: r.added,
          removed: r.removed
        };
      }

      const bufFrom = this.targets[buf] || 0;
      let main = delta;
      // 往上加时镇民要跟着让位；镇民自己已经 0，就没得让
      if (main > 0 && bufFrom - main < 0) {
        main = bufFrom;
        if (main <= 0) {
          if (!opts.quiet) {
            this.$root.$emit(
              "notify",
              `镇民已经是 0 个，没有位置可以让给${name}。`,
              "err"
            );
          }
          return null;
        }
      }

      const r1 = this.nudgeTeam(team, main, opts);
      if (!r1) return null;
      const actual = r1.to - r1.from; // 实际兑现的张数（可能被剧本可用牌数截断）
      // 镇民这一侧允许「改了目标但没有牌可填」，否则总和会崩
      const r2 = this.nudgeTeam(buf, -actual, {
        ...opts,
        quiet: true,
        allowEmpty: true
      });
      this.ensureCovers();
      const pairs = [{ team: r1.team, from: r1.from, to: r1.to }];
      if (r2) pairs.push({ team: r2.team, from: r2.from, to: r2.to });
      return {
        pairs,
        added: [...r1.added, ...(r2 ? r2.added : [])],
        removed: [...r1.removed, ...(r2 ? r2.removed : [])]
      };
    },
    /**
     * 点计数圈的 + / −：
     *   镇民 → 单纯改镇民目标；
     *   其他三个阵营 → 改这个阵营，同时拿镇民对冲（+1 则镇民 −1，−1 则镇民 +1）。
     */
    adjustTarget(team, delta) {
      const res = this.shiftTarget(team, delta, { quiet: true });
      if (res) return;
      const name = this.teamNames[team] || TEAM_CN[team] || team;
      if (delta > 0) {
        this.$root.$emit(
          "notify",
          team === "townsfolk"
            ? "镇民已经没有未上场的角色了。"
            : `${name}已经没有未上场的角色，或镇民已经让不出位置了。`,
          "err"
        );
      } else {
        this.$root.$emit("notify", `${name}里没有可以移走的角色了。`, "err");
      }
    },
    /**
     * 只结算「这一张牌」的设置调整（增量，不改别的牌）：
     *   sign = +1 加入 / −1 取消。调整只搬座位，所以每一笔都由镇民反向承接。
     *
     * 撤销时按**当初实际兑现的增量**反着走，而不是按名义值。
     * 例：限写的是「外来者 −3」，但场上只有 2 个外来者，实际只减了 2；
     * 取消时若照名义值 +3，就会多冒出一个外来者，配比再也回不到原样。
     * 所以加牌时把每个阵营的真正增减记在 role._applied 上，撤销照它回滚。
     * @returns {String} 给提示条用的一句话（没有调整则空串）
     */
    applySetupEffect(role, sign) {
      const eff = setupEffectOf(role);
      if (!eff) return "";
      const pairs = [];
      const put = res => {
        if (!res) return;
        res.pairs.forEach(p => {
          const hit = pairs.find(q => q.team === p.team);
          if (hit) hit.to = p.to;
          else pairs.push({ team: p.team, from: p.from, to: p.to });
        });
      };
      const finish = () => {
        this.ensureCovers();
        if (!pairs.length) return "";
        const text = pairs
          .map(p => `${TEAM_CN[p.team]} ${p.from} → ${p.to}`)
          .join("、");
        return `${role.name} ${sign > 0 ? "设置调整已生效" : "设置调整已撤销"}：${text}`;
      };

      // ── 撤销：按记录的增量回滚 ──
      if (sign < 0 && role._applied) {
        const applied = role._applied;
        this.$delete(role, "_applied");
        Object.keys(applied).forEach(team => {
          const d = -applied[team];
          if (!d) return;
          put(
            this.shiftTarget(team, d, {
              excludeId: role.id,
              quiet: true,
              allowEmpty: true
            })
          );
        });
        return finish();
      }

      // ── 生效：先搬人数，顺便把每一笔实际变化记下来 ──
      // 只记**主阵营**：镇民那一侧的腾挪是 shiftTarget 内部对冲出来的，
      // 记了它，撤销时会被再对冲到一次，镇民就会多出来。
      const applied = {};
      const record = res => {
        if (!res || !res.pairs.length) return;
        const p = res.pairs[0];
        applied[p.team] = (applied[p.team] || 0) + (p.to - p.from);
        put(res);
      };

      if (eff.clearMinion) {
        // 爪牙清零没有选择余地：整队下场，空出来的名额全给镇民
        const before = this.targets.minion || 0;
        (this.roleSelection.minion || []).forEach(item => {
          if (!item.selected) return;
          item.selected = 0;
          if (item.coverOf) this.$delete(item, "coverOf");
          this.clearCoverOfRole(item.id);
        });
        if (before) {
          this.$set(this.targets, "minion", 0);
          applied.minion = (applied.minion || 0) - before;
          pairs.push({ team: "minion", from: before, to: 0 });
          const res = this.nudgeTeam("townsfolk", before, { quiet: true, allowEmpty: true });
          if (res) pairs.push({ team: "townsfolk", from: res.from, to: res.to });
        }
      }

      ["outsider", "minion", "demon"].forEach(team => {
        if (!eff[team]) return;
        const v = applyValue(eff[team]);
        if (!v) return;
        record(
          this.shiftTarget(team, v, {
            excludeId: role.id,
            quiet: true,
            allowEmpty: true
          })
        );
      });

      if (Object.keys(applied).length) this.$set(role, "_applied", applied);
      return finish();
    },
    /** 加牌后的即时结算：先搬人数，再给它挑一张伪装牌 */
    onRoleAdded(role) {
      const report = this.applySetupEffect(role, 1);
      const head = report ? `${report}；` : "";
      // 被自己的调整挤出牌堆（例如外来者被减到 0）时要说清楚
      if (!role.selected) {
        this.$root.$emit(
          "notify",
          `${head}${TEAM_CN[role.team]}已经没有名额，「${role.name}」没有位置，已下场。`,
          "err"
        );
        return;
      }
      const spec = perceptionOf(role);
      if (!spec) {
        if (report) this.$root.$emit("notify", `${report}。`, "ok");
        return;
      }
      const cover = this.ensureCoverFor({ role, spec });
      if (cover) {
        this.$root.$emit(
          "notify",
          `${head}「${role.name}」拿到「${cover.name}」当伪装牌，玩家会以为自己是${
            TEAM_CN[spec.replaceWith]
          }。`,
          "ok"
        );
      } else {
        this.$root.$emit(
          "notify",
          `${head}${TEAM_CN[spec.replaceWith]}里没有没上场的牌可当伪装牌，「${role.name}」这次没有牌面。`,
          "err"
        );
      }
    },
    /**
     * 取消勾选后的即时结算：
     *   1. 撤掉这张牌带来的设置调整（男爵下场，外来者 −2、镇民 +2）；
     *   2. 顺手移除为它准备的伪装牌（认知覆盖角色）。
     * 注意这里**不自动补牌**：空出来的名额留给人自己挑，
     * 否则用户想靠点牌把某个阵营清空就永远清不掉了。
     */
    onRoleRemoved(role) {
      const spec = perceptionOf(role);
      this.clearCoverOfRole(role.id); // 顺手移除为它准备的伪装牌
      if (role.coverOf) this.$delete(role, "coverOf");
      const report = this.applySetupEffect(role, -1);
      if (report) {
        this.$root.$emit(
          "notify",
          `${report}${spec ? "；为它准备的伪装牌也一并收回" : ""}。`,
          "ok"
        );
      } else if (spec) {
        this.$root.$emit("notify", `「${role.name}」已下场，为它准备的伪装牌也一并收回。`, "ok");
      }
    },
    /** 给某个认知覆盖角色补一张伪装牌（已经打过标的跳过，避免重复点击时乱跳） */
    ensureCoverFor(item) {
      const spec = item.spec;
      if (!spec || !spec.replaceWith || !spec.detach) return null;
      if (!item.role.selected) return null;
      const roles = this.roleSelection[spec.replaceWith] || [];
      const already = roles.some(
        role => role.coverOf && String(role.coverOf.id) === String(item.role.id)
      );
      if (already) return null;
      return this.assignCover(item);
    },
    /** 某个认知覆盖角色下场后，把它那张伪装牌上的标记一起摘掉 */
    clearCoverOfRole(roleId) {
      Object.keys(this.roleSelection).forEach(team => {
        (this.roleSelection[team] || []).forEach(role => {
          if (role.coverOf && String(role.coverOf.id) === String(roleId)) {
            this.$delete(role, "coverOf");
          }
        });
      });
    },
    /**
     * 只随机某一个阵营：把该阵营已勾选的清空，再按它的目标人数重新抽取。
     * 其他阵营的勾选保持不变。可用角色不足目标人数时按实际数量全部选中。
     */
    randomizeTeam(team) {
      const roles = this.roleSelection[team];
      if (!roles || !roles.length) return;
      this.clearCoverMarks(team);
      this.clearDetachedFlags(team);
      roles.forEach(role => {
        role.selected = 0;
      });
      const count = Math.min(this.targets[team] || 0, roles.length);
      const pool = roles.slice();
      for (let i = 0; i < count; i++) {
        const [role] = pool.splice(Math.floor(Math.random() * pool.length), 1);
        role.selected = 1;
      }
      // 重抽后把伪装牌标记补回（只打标，不动人数）
      this.ensureCovers(team);
    },
    /**
     * 把每个阵营的勾选数量对齐到目标人数：
     *   不足 → 从未勾选的角色里随机补；
     *   超出 → 随机摘掉多出来的（伪装牌和认知覆盖角色不动，它们在第二步已经被赋予了身份），
     *          并把这几个名字return出去，好让提示条说清「按钮动了谁」。
     * @param {Array} onlyTeams 只处理这些阵营（默认全部）
     * @returns {{warnings: string[], removed: string[]}}
     */
    fillToTargets(onlyTeams) {
      const warnings = [];
      const removed = [];
      (onlyTeams || TEAMS).forEach(team => {
        const roles = this.roleSelection[team] || [];
        // 认知覆盖角色照常占名额；伪装牌是「没上场」的那张牌，补位时也不能把它补上场
        const pool = roles.filter(
          role => !role.selected && !role.coverOf && !perceptionOf(role) && !role.detached
        );
        // 补位优先挑普通牌：带设置调整的牌补进来还得再结算一次，没必要给自己找麻烦
        const plain = pool.filter(role => !setupEffectOf(role));
        let diff = (this.targets[team] || 0) - this.teamSelected(team);
        while (diff > 0 && pool.length) {
          const src = plain.length ? plain : pool;
          const [role] = src.splice(Math.floor(Math.random() * src.length), 1);
          const inPool = pool.indexOf(role);
          if (inPool >= 0) pool.splice(inPool, 1);
          role.selected = 1;
          diff--;
        }
        if (diff > 0) {
          warnings.push(`${TEAM_CN[team]}还差 ${diff} 个可用角色`);
        }
        if (diff < 0) {
          const extra = roles.filter(
            role => role.selected && !role.coverOf && !perceptionOf(role)
          );
          while (diff < 0 && extra.length) {
            const [role] = extra.splice(Math.floor(Math.random() * extra.length), 1);
            role.selected = 0;
            removed.push(role.name);
            diff++;
          }
          if (diff < 0) {
            warnings.push(`${TEAM_CN[team]}多出 ${-diff} 个，剩下的都是伪装牌或认知覆盖角色，请手动取消`);
          }
        }
      });
      return { warnings, removed };
    },
    /** 某个阵营整个清空（卡扎力 / 堤丰之首：移除全部爪牙） */
    clearTeamSelection(team) {
      const cleared = [];
      (this.roleSelection[team] || []).forEach(role => {
        if (role.selected || role.detached) {
          if (role.selected) cleared.push(role.name);
          role.selected = 0;
          if (role.detached) this.$delete(role, "detached");
        }
      });
      return cleared;
    },
    /** 清掉「在场但没有牌」的标记（可只清某个阵营） */
    clearDetachedFlags(onlyTeam) {
      const teams = onlyTeam ? [onlyTeam] : Object.keys(this.roleSelection);
      teams.forEach(team => {
        (this.roleSelection[team] || []).forEach(role => {
          if (role.detached) this.$delete(role, "detached");
        });
      });
    },
    /** 清掉上一次留下的伪装牌标记（可只清某个阵营） */
    clearCoverMarks(onlyTeam) {
      const teams = onlyTeam ? [onlyTeam] : Object.keys(this.roleSelection);
      teams.forEach(team => {
        (this.roleSelection[team] || []).forEach(role => {
          if (role.coverOf) this.$delete(role, "coverOf");
        });
      });
    },
    /**
     * 第二层：为一个认知覆盖角色挑一张伪装牌，并在那张牌上打标。
     * 伪装牌 = 替换阵营里「没上场」的那张牌（角色本人就是拿着它）。
     * **它不占人数**：只是视觉标记，所以不会让已选数量超过目标。
     * 如果上一轮已经给它打过标、且那张牌仍然没上场，就沿用，避免重复点击时乱跳。
     */
    assignCover(perception, prevCoverId) {
      const spec = perception.spec;
      if (!spec.replaceWith) return null;
      const roles = this.roleSelection[spec.replaceWith] || [];
      const reused = prevCoverId
        ? roles.find(
            role => String(role.id) === String(prevCoverId) && !role.selected && !perceptionOf(role)
          )
        : null;
      let cover = reused;
      if (!cover) {
        const pool = roles.filter(
          role => !role.selected && !role.coverOf && !perceptionOf(role) && !role.detached
        );
        if (!pool.length) return null;
        cover = pool[Math.floor(Math.random() * pool.length)];
      }
      this.$set(cover, "coverOf", {
        id: perception.role.id,
        name: perception.role.name,
        team: perception.role.team,
        image: perception.role.image || ""
      });
      return cover;
    },
    /** 给还没有伪装牌的认知覆盖角色补一张（只打标，不改人数）；不传 team 表示全部阵营 */
    ensureCovers(team) {
      this.perceptions
        .filter(item => item.spec.replaceWith && (!team || item.spec.replaceWith === team))
        .forEach(item => {
          this.ensureCoverFor(item);
        });
    },
    /** 角色右上角的小字：实际生效的人数变化（区间型只写取用值） */
    setupTag(role) {
      if (!role || !role.selected) return "";
      const eff = setupEffectOf(role);
      const label = deltaLabel(eff);
      if (!label) return "";
      // 被剧本可用外来者数量卡住时标注：只标「方向对得上、而且真的没兑现」的角色，
      // 避免 ±0 或者方向相反的角色也被打上「截断」
      if (eff && eff.outsider && this.clampInfo.on) {
        const v = applyValue(eff.outsider);
        const hit =
          (this.clampInfo.dir === "low" && v < 0) ||
          (this.clampInfo.dir === "high" && v > 0);
        if (hit) return `${label} 截断`;
      }
      return label;
    },
    /** 小字的悬停说明：这个角色本来能调多少、本次取了哪个值 */
    setupTagTitle(role) {
      if (!role || !role.selected) return "";
      const eff = setupEffectOf(role);
      if (!eff) return "";
      const head = `${role.name} 的设置调整：${effectDetail(eff)}。`;
      if (eff.outsider && this.clampInfo.on) {
        return `${head}剧本里只有 ${this.clampInfo.pool} 个可用外来者，结算后实际发 ${this.clampInfo.actual} 张，所以计数圈的降幅小于这个数。`;
      }
      return `${head}点「适应配置调整」后会按这个值同步左侧计数圈。`;
    },
    /**
     * 「适应配置调整」——分两步：
     *   第一步 设置调整：只改人数，随机补齐缺的角色，缺省清零（卡扎力）的整队清掉；
     *   第二步 认知覆盖：把自己的牌移出、按替换关系调人数，再随机挑一张伪装牌并打标。
     */
    applySetupAdjustment() {
      const picked = this.pickedRoles;
      if (!picked.length) {
        this.$root.$emit("notify", "还没有选择角色，先点「随机角色」或手动勾选。", "err");
        return;
      }
      const setupEffects = this.setupEffects;
      const perceptions = this.perceptions;
      if (!setupEffects.length && !perceptions.length) {
        this.resetTargets();
        this.$root.$emit("notify", "当前角色都不涉及调整，已回到官方配比。", "ok");
        return;
      }
      const res = computeTargets({
        setupEffects,
        perceptions,
        playerCount: this.nonTravelers,
        game: this.game,
        outsiderPool: this.outsiderPool
      });
      if (!res.ok) {
        this.$root.$emit("notify", res.error, "err");
        return;
      }

      // 记住上一轮的伪装牌，重复点击时尽量沿用同一张
      const prevCovers = {};
      Object.keys(this.roleSelection).forEach(team => {
        (this.roleSelection[team] || []).forEach(role => {
          if (role.coverOf) prevCovers[role.coverOf.id] = role.id;
        });
      });

      this.clearCoverMarks();
      Object.keys(res.targets).forEach(team => {
        this.$set(this.targets, team, res.targets[team]);
      });
      this.clampInfo = {
        on: !!res.clamped,
        dir: res.clampDir || null,
        actual: res.targets.outsider,
        pool: this.outsiderPool
      };

      // ── 第一步：设置调整（只改人数）──
      // 卡扎力 / 堤丰之首的「移除全部爪牙」没有选择余地，直接整队清空
      const cleared = setupEffects.some(item => item.eff.clearMinion)
        ? this.clearTeamSelection("minion")
        : [];

      // ── 第二步：认知覆盖角色留在自己阵营；但阵营名额被设置调整减到 0 时，它没有位置，只能下场 ──
      const covers = [];
      const step2Warnings = [];
      const blockedIds = new Set((res.unplaceable || []).map(item => String(item.id)));
      const droppedForRoom = [];
      const activePerceptions = perceptions.filter(item => {
        const spec = item.spec;
        if (!spec.replaceWith || !spec.detach) return false; // 魔术师 / 食人魔不改牌堆
        // 该阵营已经被减到没有名额：取消勾选，不发伪装牌，也不允许它占位
        if (blockedIds.has(String(item.role.id))) {
          item.role.selected = 0;
          if (item.role.detached) this.$delete(item.role, "detached");
          if (item.role.coverOf) this.$delete(item.role, "coverOf");
          droppedForRoom.push(item.name);
          return false;
        }
        if (item.role.detached) {
          this.$delete(item.role, "detached");
          item.role.selected = 1;
        }
        return !!item.role.selected;
      });

      // ── 第三步：把每个阵营的勾选数量对齐到目标（不足补齐、超出摘掉多选的）──
      const step1 = this.fillToTargets();

      // ── 第四步：从「没上场的牌」里挑伪装牌并打标（不占人数）──
      activePerceptions.forEach(item => {
        const spec = item.spec;
        const cover = this.assignCover(item, prevCovers[item.role.id]);
        if (cover) {
          covers.push({
            from: item.name,
            to: cover.name,
            post: `拿到这张伪装牌的人就是${item.name}，他会以为自己就是「${cover.name}」。`
          });
        } else {
          step2Warnings.push(`${TEAM_CN[spec.replaceWith]}里没有没上场的牌可以当伪装牌，${item.name} 这次没有牌面`);
        }
      });

      const warnings = [...res.warnings, ...step1.warnings, ...step2Warnings];
      const setupDetail = setupEffects.map(item => `${item.name}：${item.text}`).join("；");
      const perceptionDetail = covers
        .map(c => `${c.from} → 伪装牌「${c.to}」`)
        .join("；");
      const parts = [];
      if (setupDetail) parts.push(`设置调整 ${setupDetail}`);
      if (perceptionDetail) parts.push(`认知覆盖 ${perceptionDetail}`);
      if (cleared.length) parts.push(`已清空爪牙（${cleared.join("、")}）`);
      if (droppedForRoom.length) parts.push(`已取消勾选（${droppedForRoom.join("、")}）`);
      if (step1.removed.length) parts.push(`多选已取消（${step1.removed.join("、")}）`);
      const clampTip = res.clamped ? "（外来者已按剧本可用数量截断）" : "";
      const postTip = covers.length ? ` ${covers.map(c => c.post).join(" ")}` : "";
      const tail = warnings.length ? ` ${warnings.join("；")}` : "";
      this.$root.$emit(
        "notify",
        `${parts.join("；")}；配比 ${compositionText(res.targets)}${clampTip}。${postTip}${tail}`,
        warnings.length ? "err" : "ok"
      );
    },
    resetTargets() {
      const playerCount = Math.max(5, this.nonTravelers);
      const composition = this.game[playerCount - 5];
      this.targets = {
        townsfolk: composition.townsfolk,
        outsider: composition.outsider,
        minion: composition.minion,
        demon: composition.demon
      };
      this.clampInfo = { on: false, dir: null, actual: 0, pool: 0 };
    },
    handleResize(){
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    selectRandomRoles(announce) {
      // 先复原到该人数的官方配比（9 人 → 5/2/1/1），再按这个配比重抽。
      // 左侧 + / − 改过的目标值、以及「适应配置调整」算出来的配比，都不参与本按钮。
      // 注意：这里只影响本按钮；角色分类下面的单个「随机」仍然按当前目标人数重抽。
      this.resetTargets();
      this.clearCoverMarks();
      this.clearDetachedFlags();
      this.roleSelection = {};
      this.roles.forEach(role => {
        if (!this.roleSelection[role.team]) {
          this.$set(this.roleSelection, role.team, []);
        }
        this.roleSelection[role.team].push(role);
        this.$set(role, "selected", 0);
      });
      const teamSelected = ["townsfolk", "outsider", "minion", "demon"];
      const teamDeselected = [];
      Object.keys(this.roleSelection).forEach(team => {
        if (!teamSelected.includes(team)) teamDeselected.push(team);
      });
      teamDeselected.forEach(team => {
        delete this.roleSelection[team];
      });
      // 随机抽取的数量取自刚复原的官方配比。
      // 这里先存快照：下面的自动结算会改 this.targets，直接读会读到改过的数。
      const snapshot = Object.assign({}, this.targets);
      Object.keys(snapshot).forEach(team => {
        for (let x = 0; x < snapshot[team]; x++) {
          if (this.roleSelection[team]) {
            const available = this.roleSelection[team].filter(
              role => !role.selected
            );
            if (available.length) {
              randomElement(available).selected = 1;
            }
          }
        }
      });
      // 抽到的牌里带设置调整 / 认知覆盖的，当场结算一次，不用再点「适应配置调整」
      const notes = this.settlePickedRoles();
      if (announce === true) {
        const settled = notes.length ? ` 已自动结算设置调整：${notes.join("；")}。` : "";
        this.$root.$emit(
          "notify",
          `已复原官方配比 ${compositionText(snapshot)}（${this.nonTravelers} 人），并按此随机抽取角色。` +
            settled,
          "ok"
        );
      }
    },
    /**
     * 随机抽牌后自动结算：把抽到的设置调整牌逐张生效。
     * 结算时补进来的牌本身也可能带设置调整，所以最多扫三轮。
     */
    settlePickedRoles() {
      const notes = [];
      const done = new Set();
      for (let round = 0; round < 3; round++) {
        const pending = [];
        Object.keys(this.roleSelection).forEach(team => {
          (this.roleSelection[team] || []).forEach(role => {
            if (done.has(role)) return;
            done.add(role);
            if (!role.selected) return;
            if (setupEffectOf(role)) pending.push(role);
          });
        });
        if (!pending.length) break;
        pending.forEach(role => {
          const text = this.applySetupEffect(role, 1, { quiet: true });
          if (text) notes.push(text);
        });
      }
      this.ensureCovers();
      return notes;
    },
    /** 认知覆盖角色 → 它拿在手上的那张伪装牌（没上场的牌） */
    coverMap() {
      const map = {};
      Object.values(this.roleSelection).forEach(roles => {
        (roles || []).forEach(role => {
          if (role.coverOf && !role.selected) {
            map[String(role.coverOf.id)] = role;
          }
        });
      });
      return map;
    },
    /** 把已选角色打乱成待分配数组（重复角色按数量展开） */
    buildShuffledRoles() {
      const coverMap = this.coverMap();
      const list = [];
      Object.values(this.roleSelection).forEach(roles => {
        (roles || []).forEach(role => {
          const count = role.selected || 0;
          if (!count) return;
          // 认知覆盖角色发给玩家的是它的伪装牌：牌面换成那一个，
          // 但保留 coverOf 标记，好让魔典知道这张牌背后是谁
          const cover = coverMap[String(role.id)];
          const card = cover
            ? Object.assign({}, cover, {
                selected: 1,
                coverOf: {
                  id: role.id,
                  name: role.name,
                  team: role.team,
                  image: role.image || ""
                }
              })
            : role;
          for (let i = 0; i < count; i++) list.push(card);
        });
      });
      return list
        .map(a => [Math.random(), a])
        .sort((a, b) => a[0] - b[0])
        .map(a => a[1]);
    },
    assignRoles(allowReview = true) {
      if (!this.canAssign) return;
      // generate list of selected roles and randomize it
      if (!allowReview && this.session.isReview) {
        this.$store.commit("session/setIsReview", false);
      }
      const roles = this.buildShuffledRoles();
      // 换了一批角色就是新的一局：统一走 newGame 复位（角色/生死/提示标记/夜序完成标记/投票/临时状态）
      this.$store.dispatch("newGame", {
        pickRole: player => {
          if (player.role.team === "traveler" || !roles.length) return player.role;
          return roles.pop();
        }
      });
      this.$root.$emit(
        "notify",
        "角色已重新分配，各座位的死亡状态与提示标记已清空。",
        "ok"
      );
      this.$store.commit("toggleModal", "roles");
    },
    drawRoles() {
      if (!this.canAssign) return;
      // generate list of selected roles and randomize it
      const roles = this.buildShuffledRoles();
      this.$store.commit("session/setDrawRoles", roles);
      this.$store.commit("toggleModal", "roles");
      this.$store.commit("toggleModal", "draw");
    },
    ...mapMutations(["toggleModal"])
  },
  mounted: function() {
    this.resetTargets();
    if (!Object.keys(this.roleSelection).length) {
      this.selectRandomRoles();
    }
    window.addEventListener("resize", this.handleResize);
  },
  beforeDestroy(){
    window.removeEventListener("resize", this.handleResize);
  },
  watch: {
    roles() {
      this.resetTargets();
      this.selectRandomRoles();
    },
    nonTravelers() {
      // 人数变化后回到该人数的官方配比
      this.resetTargets();
      this.selectRandomRoles();
    }
  }
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

ul.tokens {
  /*
   * 左侧计数圈整列的位置：圈下面那排「− + 骰子」比圈本身宽，
   * 原来只留 7% 时按钮行会顶到窗口左边、被 .slot 的 overflow-x:hidden 裁掉一半，点不到。
   * 这里按「列宽 + 一点余量」留边，按钮行永远完整落在框内。
   */
  --count-col: clamp(64px, 8vw, 76px);
  padding-left: calc(var(--count-col) + 10px);
  // 给左侧计数圈下方的 + / − 留出空间，避免压到下一行角色
  // 阵营之间的间隙收窄一档，手机上一屏能多塞一整个阵营
  margin-bottom: 10px;
  li {
    border-radius: 50%;
    margin: 5px;
    position: relative;
    opacity: 0.5;
    transition: all 250ms;
    &.selected {
      opacity: 1;
      .buttons {
        display: flex;
      }
      .fa-exclamation-triangle {
        display: block;
      }
    }
    /**
     * 伪装牌：这张牌没上场，但被某个认知覆盖角色拿去当牌面。
     * 它不算人数，所以没有 selected 的亮框，需要单独给个记号，否则说书人根本找不着。
     */
    &.is-cover {
      opacity: 0.95;
      filter: grayscale(0.45) brightness(0.9);
      box-shadow: 0 0 0 3px rgba(255, 205, 140, 0.85), 0 0 16px rgba(255, 175, 80, 0.5);
      &::after {
        content: "伪装牌";
        position: absolute;
        left: 50%;
        bottom: -10px;
        transform: translateX(-50%);
        padding: 1px 6px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.88);
        border: 1px solid rgba(255, 175, 80, 0.75);
        color: #ffcf8a;
        font-size: 10px;
        line-height: 1.4;
        white-space: nowrap;
        z-index: 9;
        pointer-events: none;
      }
    }
    &.townsfolk {
      box-shadow: 0 0 10px $townsfolk, 0 0 10px #004cff;
    }
    &.outsider {
      box-shadow: 0 0 10px $outsider, 0 0 10px $outsider;
    }
    &.minion {
      box-shadow: 0 0 10px $minion, 0 0 10px $minion;
    }
    &.demon {
      box-shadow: 0 0 10px $demon, 0 0 10px $demon;
    }
    &.traveler {
      box-shadow: 0 0 10px $traveler, 0 0 10px $traveler;
    }
    /* 计数圈不跟着牌一起放大：它贴着窗口左边，放大就会有一半被框裁掉、点不到 */
    &:not(.count):hover {
      transform: scale(1.2);
      z-index: 10;
    }
    .fa-exclamation-triangle {
      position: absolute;
      color: red;
      filter: drop-shadow(0 0 3px black) drop-shadow(0 0 3px black);
      top: 5px;
      right: -5px;
      font-size: 150%;
      display: none;
    }
    .buttons {
      display: none;
      position: absolute;
      top: 95%;
      text-align: center;
      width: 100%;
      z-index: 30;
      font-weight: bold;
      filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
      span {
        flex-grow: 1;
      }
      svg {
        opacity: 0.25;
        cursor: pointer;
        &:hover {
          opacity: 1;
          color: red;
        }
      }
    }
  }
  .count {
    opacity: 1;
    position: absolute;
    /* 整列（含下面的 − + 骰子）都收在框内：左边留 4px 呼吸，列宽由 ul 上的变量决定 */
    left: 4px;
    top: 0;
    margin: 6px 0 0;
    font-weight: bold;
    font-size: 75%;
    width: var(--count-col, 72px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 20;

    .frac {
      /* 圆圈不撑满整列，把两侧的空间留给按钮行 */
      width: min(100%, 56px);
      aspect-ratio: 1 / 1;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      background: radial-gradient(
        circle at 40% 32%,
        rgba(64, 64, 64, 0.95),
        rgba(0, 0, 0, 0.95) 72%
      );
      border: 2px solid currentColor;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.8),
        inset 0 0 10px rgba(0, 0, 0, 0.9);
      .slash {
        opacity: 0.55;
        margin: 0 1px;
      }
    }

    .count-buttons {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      gap: 2px;
      margin-top: 3px;
      padding: 1px 0;
      z-index: 30;
      filter: drop-shadow(0 0 4px rgba(0, 0, 0, 1));
      svg {
        opacity: 0.8;
        color: #e6e6e6;
        cursor: pointer;
        /* 三个按钮要挤进左侧这一列里，别让整行比圆圈还宽 */
        font-size: 116%;
        padding: 2px 1px;
        &:hover {
          opacity: 1;
          color: #ff4d4d;
        }
        &.muted {
          opacity: 0.25;
        }
        // 只随机本阵营
        &.dice {
          color: #ffce8a;
          opacity: 0.9;
          margin-left: 1px;
          &:hover {
            color: #fff;
            text-shadow: 0 0 6px #ffce8a;
          }
        }
      }
    }

    &.townsfolk {
      color: $townsfolk;
    }
    &.outsider {
      color: $outsider;
    }
    &.minion {
      color: $minion;
    }
    &.demon {
      color: $demon;
    }
  }
}

.roles .modal {
  // 标题给右上角的最大化 / 关闭按钮让位
  h3 {
    padding: 0 64px;
  }

  .validate {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 10px auto 2px;
    padding: 6px 14px;
    max-width: 92%;
    border-radius: 10px;
    font-size: 80%;
    line-height: 1.35;
    color: #ffb3b3;
    background: rgba(120, 0, 0, 0.35);
    border: 1px solid rgba(255, 80, 80, 0.45);
    text-align: center;
    &.ok {
      color: #b6f0c9;
      background: rgba(0, 80, 30, 0.35);
      border-color: rgba(90, 220, 140, 0.45);
    }
    svg {
      flex: none;
    }
  }

  .multiple {
    display: block;
    text-align: center;
    cursor: pointer;
    &.checked,
    &:hover {
      color: red;
    }
    &.checked {
      margin-top: 10px;
    }
    svg {
      margin-right: 5px;
    }
    input {
      display: none;
    }
  }

  // 复盘视角警告：保留
  .warningReview {
    color: yellow;
    position: absolute;
    bottom: 20px;
    left: 20px;
    z-index: 10;
    svg {
      font-size: 150%;
      vertical-align: middle;
    }
    span {
      display: none;
      text-align: center;
      position: absolute;
      left: -20px;
      bottom: 30px;
      width: 420px;
      background: rgba(0, 0, 0, 0.75);
      padding: 5px;
      border-radius: 10px;
      border: 2px solid black;
    }
    &:hover span {
      display: block;
    }
  }

  // 「适应配置调整」按钮：单独一行
  .setupAdapt {
    display: flex;
    justify-content: center;
    margin: 6px auto 0;
    max-width: 92%;
    font-size: 74%;

    button.adapt {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 11px;
      border-radius: 11px;
      border: 1px solid rgba(255, 175, 80, 0.6);
      background: linear-gradient(#3a2a12, #171006);
      color: #ffcf8a;
      font-family: inherit;
      font-size: 1em;
      white-space: nowrap;
      cursor: pointer;
      transition: all 150ms;
      small {
        opacity: 0.7;
        font-size: 0.92em;
      }
      &:hover {
        color: #fff;
        border-color: #ffcf8a;
        background: linear-gradient(#513a17, #22160a);
      }
      &:active {
        transform: scale(0.97);
      }
    }
  }
}
</style>
