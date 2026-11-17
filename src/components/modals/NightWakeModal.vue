<template>
  <Modal
    class="night-wake"
    @close="toggleModal('nightWake')"
    v-if="modals.nightWake && roles.size"
  >
    <div class="nw-panel">
      <header class="nw-head">
        <div class="nw-phase">
          <button class="nw-step" @click="changeNight(-1)" title="上一夜">
            <font-awesome-icon icon="minus" />
          </button>
          <span class="nw-phase-label" :class="{ day: !isNight }">
            第 {{ night }} 夜
          </span>
          <button class="nw-step" @click="changeNight(1)" title="下一夜">
            <font-awesome-icon icon="plus" />
          </button>
        </div>
        <div class="nw-titles">
          <h3>
            夜间唤醒助手
            <font-awesome-icon icon="cloud-moon" />
          </h3>
          <p>
            {{ isFirst
              ? "第一夜顺序 · 从上往下唤醒"
              : "其他夜顺序 · 从上往下唤醒" }}
            <span class="nw-dot">·</span>
            {{ doneCount }} / {{ rows.length }} 已处理
          </p>
        </div>
      </header>

      <div class="nw-tools">
        <button
          class="nw-chip"
          :class="{ on: onlyPending }"
          @click="onlyPending = !onlyPending"
        >
          只看未处理
        </button>
        <button
          class="nw-chip"
          :class="{ on: withDead }"
          @click="withDead = !withDead"
        >
          显示已死亡
        </button>
        <button class="nw-chip" @click="resetNight">清空本夜进度</button>
        <span class="nw-hint">点一行就是「已唤醒」，再点一次撤回</span>
      </div>

      <p class="nw-empty" v-if="!rows.length">
        这一{{ isNight ? "夜" : "天" }}没有需要唤醒的角色。请确认已分配角色。
      </p>
      <p class="nw-empty" v-else-if="!visible.length">
        本{{ isNight ? "夜" : "天" }}的行动都处理完了。
      </p>

      <ol class="nw-list" v-else>
        <li
          v-for="row in visible"
          :key="row.key + '-' + (row.info ? row.alias : row.index)"
          class="nw-row"
          :class="{ done: row.done, dead: row.dead, info: row.info }"
          @click="toggle(row)"
        >
          <div class="nw-order">
            <em>{{ row.order }}</em>
          </div>
          <div class="nw-icon" :class="row.role.team">
            <span :style="iconStyle(row)"></span>
          </div>
          <div class="nw-seat" v-if="row.seat">{{ row.seat }}</div>
          <div class="nw-main">
            <div class="nw-name">
              <template v-if="row.info">{{ row.role.name }}</template>
              <template v-else>
                {{ row.player.name || "空座位" }}
                <span class="nw-role" :class="row.role.team">
                  {{ row.role.name }}
                </span>
                <span class="nw-dead" v-if="row.dead">已死亡</span>
              </template>
            </div>
            <p class="nw-text">
              {{ row.text || "该角色本夜无需唤醒，按能力自行判断。" }}
            </p>
          </div>
          <div class="nw-check">
            <font-awesome-icon
              :icon="['fas', row.done ? 'check-square' : 'square']"
            />
          </div>
        </li>
      </ol>
    </div>
  </Modal>
</template>

<script>
import Modal from "./Modal";
import { mapMutations, mapState } from "vuex";
import { roleIconUrl } from "../../logic/roleIcon";
import iconMixin from "../../logic/iconMixin";

export default {
  name: "NightWakeModal",
  mixins: [iconMixin],
  components: { Modal },
  data() {
    return {
      // 默认只看未处理；已死亡默认不显示（死人夜里不会被唤醒）
      onlyPending: true,
      withDead: false,
      // 「爪牙信息 / 恶魔信息」没有对应玩家，进度只能记在组件本地
      infoDone: {}
    };
  },
  computed: {
    // 夜次存在 store.grimoire.night，随 localStorage 持久化；新开一局会回默认第 1 夜
    night() {
      return this.grimoire.night;
    },
    isFirst() {
      return this.night <= 1;
    },
    ...mapState(["roles", "modals", "grimoire", "session"]),
    ...mapState("players", ["players", "fabled"]),
    isNight() {
      return this.grimoire.isNight;
    },
    doneKey() {
      return (this.isFirst ? "f" : "o") + this.night;
    },
    rows() {
      // 与官方 NightOrderModal 一致：直接用角色自身的 firstNight / otherNight 原始值判断，
      // 不再依赖 players/nightOrder getter（它返回的是排序后的「下标」，
      // 自定义角色没配进 firstNightOrder 时 indexOf 得 -1、Math.max(-1,0)=0 会被当作不行动，
      // 于是自定义角色一律显示“不需要唤醒”）。
      const rows = [];
      // 首夜且人数 > 6 时，插入「爪牙信息 / 恶魔信息」两条（与夜间顺序表一致）
      const withInfo = this.isFirst && this.players.length > 6;
      this.players.forEach((player, index) => {
        const role = player.role;
        if (!role || !role.id) return;
        // 官方逻辑：首夜看 firstNight、其他夜看 otherNight，>0 即本夜行动；
        // 旅行者只有真的在场(有座位玩家)时才上榜。
        const raw = this.isFirst ? role.firstNight : role.otherNight;
        let ord = Number(raw) || 0;
        if (!ord) return; // 本夜不行动（原始值为 0 / 未定义）
        if (this.isFirst && role.team === "traveler" && !player.id) return;
        const key = this.doneKey + "-p-" + index;
        rows.push({
          key,
          index,
          seat: index + 1,
          player,
          role,
          order: ord,
          text: this.isFirst ? role.firstNightReminder : role.otherNightReminder,
          dead: !!player.isDead || this.hasDeathMark(player),
          done: !!(player.nightDone && player.nightDone[this.doneKey]),
          info: false
        });
      });
      if (withInfo) {
        const evilList = [
          {
            alias: "minioninfo",
            name: "爪牙信息",
            team: "minion",
            order: 0,
            text:
              "如果爪牙多于一位，让他们互相看清彼此。展示这是恶魔卡片，指向恶魔。",
            match: p => p.role.team === "minion"
          },
          {
            alias: "demoninfo",
            name: "恶魔信息与伪装身份",
            team: "demon",
            order: 0,
            text:
              "展示这些是你的爪牙卡片，并指向每个爪牙。展示这些身份不在游戏中卡片，并展示3个不在场的善良身份。",
            match: p => p.role.team === "demon"
          }
        ];
        // 爪牙/恶魔信息在原始角色编号里固定在 dusc 之后、首位角色之前：
        // 用一个小于所有真实 order 的序号放到最前面，保证排在最上
        evilList.forEach((info, i) => {
          const key = this.doneKey + "-info-" + info.alias;
          rows.push({
            key,
            index: -1,
            seat: null,
            alias: info.alias,
            role: { id: "evil", name: info.name, team: info.team },
            order: i === 0 ? 0.5 : 0.6, // 伪序，仅用于排在最前
            text: info.text,
            dead: false,
            done: !!this.infoDone[key],
            info: true
          });
        });
      }
      rows.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return (a.seat || 99) - (b.seat || 99);
      });
      // 重新编号为 1..N（伪序 0.5/0.6 也变成 1、2）
      rows.forEach((row, i) => {
        row.order = i + 1;
      });
      return rows;
    },
    visible() {
      return this.rows.filter(row => {
        if (!this.withDead && row.dead) return false;
        if (this.onlyPending && row.done) return false;
        return true;
      });
    },
    doneCount() {
      return this.rows.filter(row => row.done).length;
    }
  },
  methods: {
    hasDeathMark(player) {
      return (player.reminders || []).some(
        r => r && String(r.name || "").trim() === "死亡"
      );
    },
    iconStyle(row) {
      const role = row.role || {};
      if (row.info) {
        // 爪牙/恶魔信息用阵营占位图（evil）
        return { backgroundImage: `url(${this.safeIcon("evil")})` };
      }
      // 与 Token.vue / 座位牌一致：统一走 roleIconUrl（支持「角色图标强制加载」用 BWIKI 图床）
      const url = roleIconUrl(role, this.grimoire, this.iconStatusRev);
      return url ? { backgroundImage: `url(${url})` } : {};
    },
    // 与现有夜间顺序表一致：从 assets/icons 里 require，缺图返回空
    safeIcon(id) {
      if (!id) return "";
      try {
        return require("../../assets/icons/" + id + ".png");
      } catch (e) {
        return "";
      }
    },
    changeNight(delta) {
      const next = this.night + delta;
      if (next < 1) return;
      this.$store.commit("setNight", next);
    },
    toggle(row) {
      if (row.info) {
        // 「爪牙信息 / 恶魔信息」没有对应玩家，进度记在组件本地
        const key = row.key;
        if (this.infoDone[key]) this.$delete(this.infoDone, key);
        else this.$set(this.infoDone, key, true);
        return;
      }
      // 存到玩家对象的 nightDone 上，按「具体夜次」存键(doneKey = "f"/"o" + 夜次)，
      // 与座位牌(Player.vue)共享同一份状态：点完成后座位上的夜序数字会变绿，
      // 切换到别的一夜时读的是另一个键，旧的绿标自然不会残留。
      const player = row.player;
      const key = this.doneKey;
      const cur = Object.assign({}, player.nightDone || {});
      if (cur[key]) this.$delete(cur, key);
      else cur[key] = true;
      this.$store.commit("players/update", {
        player,
        property: "nightDone",
        value: cur
      });
    },
    resetNight() {
      // 玩家的进度：只清掉「本夜」的标记(doneKey 含具体夜次)
      this.players.forEach(player => {
        if (player.nightDone && player.nightDone[this.doneKey]) {
          const cur = Object.assign({}, player.nightDone);
          this.$delete(cur, this.doneKey);
          this.$store.commit("players/update", {
            player,
            property: "nightDone",
            value: cur
          });
        }
      });
      // 信息的进度：清空组件本地
      this.infoDone = {};
    },
    ...mapMutations(["toggleModal"])
  }
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

.nw-panel {
  width: 760px;
  max-width: 100%;
  /* 固定高度：点掉一行后「只看未处理」会过滤掉该行，列表一变短窗口就跟着缩，
     鼠标底下的东西全跳位，看着像窗口在抖。高度写死，只让内部列表自己滚。 */
  height: 78vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 4px 6px 10px;
  color: #eee9dd;
  text-align: left;
}

.nw-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 4px 12px;
  border-bottom: 1px solid rgba(201, 173, 126, 0.22);
}

.nw-phase {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.nw-step {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(201, 173, 126, 0.5);
  background: rgba(255, 255, 255, 0.05);
  color: #d9c39a;
  cursor: pointer;
  font-size: 0.7em;
  &:hover {
    color: #ffce8a;
  }
}
.nw-phase-label {
  min-width: 78px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid rgba(201, 173, 126, 0.5);
  background: linear-gradient(180deg, #1b2632, #0a1015);
  color: #ffd9a0;
  font-size: 0.86em;
  letter-spacing: 1px;
  text-align: center;
  &.day {
    color: #ffe9b8;
    border-color: rgba(255, 214, 130, 0.75);
    background: linear-gradient(180deg, #3a2c14, #150e05);
  }
}

.nw-titles {
  h3 {
    text-align: left;
    font-size: 0.95em;
    letter-spacing: 2px;
    margin: 0;
    svg {
      vertical-align: middle;
    }
  }
  p {
    margin: 3px 0 0;
    font-size: 0.68em;
    color: #a9a9a9;
  }
  .nw-dot {
    margin: 0 6px;
    opacity: 0.5;
  }
}

.nw-tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 2px;
  .nw-hint {
    margin-left: auto;
    font-size: 0.62em;
    color: #818181;
  }
}
.nw-chip {
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: #cfcfcf;
  font-size: 0.66em;
  cursor: pointer;
  &:hover {
    color: #ffce8a;
  }
  &.on {
    color: #1a1206;
    background: linear-gradient(180deg, #e8c88f, #c9ad7e);
    border-color: #ffdfae;
  }
}

.nw-empty {
  flex: 1;
  margin: 18px 4px;
  font-size: 0.72em;
  line-height: 1.7;
  color: #9a9a9a;
}

.nw-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  list-style: none;
  margin: 0;
}

.nw-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 8px;
  border-radius: 9px;
  border: 1px solid transparent;
  border-bottom-color: rgba(255, 255, 255, 0.07);
  cursor: pointer;
  transition: background 160ms, opacity 160ms;
  &:hover {
    background: rgba(255, 206, 138, 0.07);
  }
  &.done {
    opacity: 0.45;
    .nw-name {
      text-decoration: line-through;
    }
  }
  &.dead .nw-seat {
    filter: grayscale(1);
  }
}

.nw-order {
  flex: none;
  width: 28px;
  padding-top: 2px;
  em {
    display: inline-block;
    min-width: 22px;
    padding: 1px 4px;
    border-radius: 5px;
    font-style: normal;
    font-size: 0.7em;
    text-align: center;
    color: #1a1206;
    background: linear-gradient(180deg, #e9d1a5, #c9ad7e);
  }
}

.nw-seat {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(201, 173, 126, 0.45);
  background: #12181f;
  color: #d9c39a;
  font-size: 0.68em;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nw-icon {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  span {
    display: block;
    width: 100%;
    height: 100%;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
  }
  &.minion {
    border-color: rgba(240, 163, 163, 0.45);
  }
  &.demon {
    border-color: rgba(208, 140, 255, 0.45);
  }
}

.nw-main {
  flex: 1;
  min-width: 0;
}
.nw-name {
  font-size: 0.8em;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.nw-role {
  font-size: 0.8em;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  &.townsfolk {
    color: #9ecbff;
  }
  &.outsider {
    color: #b9e0a5;
  }
  &.minion {
    color: #f0a3a3;
  }
  &.demon {
    color: #d08cff;
  }
}
.nw-dead {
  font-size: 0.75em;
  color: #d98a8a;
}
.nw-text {
  margin: 4px 0 0;
  font-size: 0.7em;
  line-height: 1.6;
  color: #b9b9b9;
}

.nw-check {
  flex: none;
  padding-top: 4px;
  font-size: 0.9em;
  color: #6d7a86;
  .done & {
    color: #7fd39a;
  }
}
</style>
