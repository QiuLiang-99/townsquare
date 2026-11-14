<template>
  <div class="qw-layer">
    <Modal
      name="quick"
      v-if="modals.quick"
      @close="close"
    >
      <!-- 第一步：选一条短语 -->
      <div class="qw-panel" v-if="!current">
        <header class="qw-head">
          <h3>快捷唤醒短语</h3>
          <p>说书人半夜叫醒玩家时要说的话。点一条开始填空。</p>
        </header>
        <ul class="qw-list">
          <li
            v-for="(item, idx) in phrases"
            :key="item.key"
            @click="openPhrase(item)"
          >
            <span class="qw-list-idx">{{ idx + 1 }}</span>
            <span class="qw-list-text">{{ previewText(item) }}</span>
          </li>
        </ul>
      </div>

      <!-- 第二步：填这句话 -->
      <div class="qw-panel" v-else>
        <header class="qw-head">
          <h3>快捷唤醒短语</h3>
          <button class="qw-back" @click="current = null">
            <font-awesome-icon icon="arrow-left" /> 返回列表
          </button>
        </header>

        <!-- 一句话预览：空位在句子里就是一个个可点的格子 -->
        <div class="qw-line">
          <template v-for="(seg, i) in phrase.seg">
            <span class="qw-text" :key="'t' + i" v-if="!isSlot(seg)">{{ seg }}</span>
            <button
              v-else
              :key="'s' + i"
              class="qw-chip"
              :class="{
                filled: !!picked[slotKey(seg)],
                active: active === slotKey(seg),
                optional: isOptional(seg)
              }"
              :title="isOptional(seg) ? '可留空' : '必填'"
              @click="active = slotKey(seg)"
            >
              <span class="qw-chip-token" v-if="slotType(seg) === 'role'">
                <Token
                  v-if="picked[slotKey(seg)]"
                  :role="picked[slotKey(seg)]"
                  :show-corner="false"
                />
                <font-awesome-icon v-else icon="question" />
              </span>
              <span class="qw-chip-align" v-else-if="slotType(seg) === 'align' && picked[slotKey(seg)]" :class="picked[slotKey(seg)]">
                <img :src="picked[slotKey(seg)] === 'good' ? goodIcon : evilIcon" alt="" />
                {{ ALIGN_LABEL[picked[slotKey(seg)]] }}{{ seg.suffix || "" }}
              </span>
              <span class="qw-chip-num" v-else-if="slotType(seg) === 'num' && picked[slotKey(seg)]">
                {{ picked[slotKey(seg)] }}
              </span>
              <span class="qw-chip-name" v-if="slotType(seg) === 'role'">
                {{ picked[slotKey(seg)] ? picked[slotKey(seg)].name : "点选角色" }}
              </span>
              <span class="qw-chip-name" v-else-if="slotType(seg) === 'seat'">
                {{ picked[slotKey(seg)] ? picked[slotKey(seg)] + "号玩家" : "玩家" }}
              </span>
              <span class="qw-chip-name" v-else-if="!picked[slotKey(seg)]">
                {{ slotLabel(slotType(seg)) }}
              </span>
              <span class="qw-chip-opt" v-if="isOptional(seg)">可选</span>
            </button>
          </template>
        </div>

        <!-- 下面按当前选中的空位类型换不同的选择器 -->
        <div class="qw-picker" v-if="activeDef">
          <!-- 角色：沿用城镇广场的圆牌风格（ul.tokens） -->
          <template v-if="activeType === 'role'">
            <div class="qw-tools">
              <input class="qw-search" v-model="search" placeholder="搜索角色名或能力" />
              <div class="qw-tabs">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  class="qw-tab"
                  :class="{ on: team === tab.key }"
                  @click="team = tab.key"
                >
                  {{ tab.label }}
                </button>
                <button class="qw-tab" :class="{ on: hideUsed }" @click="hideUsed = !hideUsed">
                  只看不在场
                </button>
              </div>
            </div>

            <p class="qw-count">
              共 {{ list.length }} 张牌
              <span class="qw-tip">已在场的牌会标出座位号，需要时也能选</span>
            </p>

            <ul class="tokens">
              <li
                v-for="role in list"
                :key="role.id"
                :class="[role.team, { used: !!usedBy(role), current: isPicked(role) }]"
                :title="role.ability || ''"
                @click="pickRole(role)"
              >
                <Token :role="role" :tag="usedBy(role) ? usedBy(role) + '号' : ''" />
              </li>
            </ul>
            <p class="qw-empty" v-if="!list.length">没有匹配的角色，换个关键词或类型试试。</p>
          </template>

          <!-- 善良 / 邪恶 -->
          <div class="qw-align" v-else-if="activeType === 'align'">
            <button
              class="qw-align-btn good"
              :class="{ on: picked[active] === 'good' }"
              @click="pickAlign('good')"
            >
              <img class="qw-align-thumb" :src="goodIcon" alt="" />
              善良
            </button>
            <button
              class="qw-align-btn evil"
              :class="{ on: picked[active] === 'evil' }"
              @click="pickAlign('evil')"
            >
              <img class="qw-align-thumb" :src="evilIcon" alt="" />
              邪恶
            </button>
          </div>

          <!-- 1–12 名玩家 -->
          <div class="qw-nums" v-else-if="activeType === 'num'">
            <button
              v-for="n in 12"
              :key="'n' + n"
              class="qw-num"
              :class="{ on: picked[active] === n }"
              @click="pickNum(n)"
            >
              {{ n }}
            </button>
          </div>

          <!-- 座位号：1–当前魔典最大座位号 -->
          <div class="qw-nums" v-else-if="activeType === 'seat'">
            <button
              v-for="n in maxSeat"
              :key="'seat' + n"
              class="qw-num"
              :class="{ on: picked[active] === n }"
              @click="pickNum(n)"
            >
              {{ n }}
            </button>
          </div>

          <!-- 可选格子（绿色）：随时可以把这一格清空 -->
          <div class="qw-slot-clear" v-if="activeOptional">
            <button class="qw-clear-btn" @click="clearActive">
              <font-awesome-icon icon="eraser" /> 这一格留空
            </button>
            <span class="qw-clear-tip">绿色边框的格子都可以不填</span>
          </div>
        </div>

        <!-- 没有空位的短语（是否使用你的能力 / 做出你的选择）直接展示 -->
        <p class="qw-plain" v-else>
          这句话没有要填的内容，直接点「展示给玩家」。
        </p>

        <div class="qw-actions">
          <button class="qw-btn ghost" @click="reset" :disabled="!filledCount">
            <font-awesome-icon icon="eraser" /> 清空
          </button>
          <button class="qw-btn" @click="show" :disabled="!ready">
            <font-awesome-icon icon="eye" /> 展示给玩家
          </button>
        </div>
      </div>
    </Modal>

    <!-- 全屏展示：和「给恶魔看」同一个观感，只是内容换成这句话 -->
    <transition name="panel-fade">
      <div class="qw-show" v-if="showing" @click="closeShow">
        <div class="qws-line">
          <template v-for="(seg, i) in phrase.seg">
            <span class="qws-text" :key="'st' + i" v-if="!isSlot(seg)">{{ seg }}</span>
            <span
              class="qws-role"
              :key="'sr' + i"
              v-else-if="slotType(seg) === 'role' && picked[slotKey(seg)]"
            >
              <Token :role="picked[slotKey(seg)]" :show-corner="false" />
              <b>{{ picked[slotKey(seg)].name }}</b>
            </span>
            <span
              class="qws-align"
              :key="'sa' + i"
              v-else-if="slotType(seg) === 'align' && picked[slotKey(seg)]"
              :class="picked[slotKey(seg)]"
            >
              <img :src="picked[slotKey(seg)] === 'good' ? goodIcon : evilIcon" alt="" />
              {{ ALIGN_LABEL[picked[slotKey(seg)]] }}{{ seg.suffix || "" }}
            </span>
            <span
              class="qws-num"
              :key="'sn' + i"
              v-else-if="slotType(seg) === 'num' && picked[slotKey(seg)]"
            >
              {{ picked[slotKey(seg)] }}
            </span>
            <span
              class="qws-seat"
              :key="'ss' + i"
              v-else-if="slotType(seg) === 'seat'"
            >
              {{ picked[slotKey(seg)] ? picked[slotKey(seg)] + "号玩家" : "玩家" }}
            </span>
          </template>
        </div>
        <p class="qws-hint">展示完成后，将设备交回说书人 · 点任意处关闭</p>
      </div>
    </transition>
  </div>
</template>

<script>
import Modal from "./Modal";
import Token from "../Token";
import { mapState } from "vuex";
import {
  QUICK_PHRASES,
  isSlot,
  slotType,
  slotKey,
  slotDef,
  slotLabel,
  ALIGN_LABEL
} from "../../logic/phrases";
import goodIcon from "../../assets/good.png";
import evilIcon from "../../assets/evil.png";

/** 打开短语时按 slots 里的 default 预填（「选择N名玩家」默认就是 1） */
function defaultPicked(phrase) {
  const picked = {};
  ((phrase && phrase.slots) || []).forEach(slot => {
    if (slot.default !== undefined) picked[slot.key] = slot.default;
  });
  return picked;
}

const ROLE_TEAMS = ["townsfolk", "outsider", "minion", "demon"];

export default {
  name: "QuickWakeModal",
  components: { Modal, Token },
  data() {
    return {
      phrases: QUICK_PHRASES,
      current: null,
      picked: {},
      active: "",
      search: "",
      team: "all",
      hideUsed: false,
      showing: false,
      ALIGN_LABEL,
      goodIcon,
      evilIcon
    };
  },
  computed: {
    ...mapState(["modals", "roles", "session"]),
    ...mapState("players", ["players"]),
    /** 当前短语（internal），无则显示列表 */
    phrase() {
      return this.current;
    },
    // 该剧本里所有可用的角色（Map → 数组），按阵营分组，去掉旅行者/传奇
    allRoles() {
      const roles =
        this.roles instanceof Map
          ? Array.from(this.roles.values())
          : Array.isArray(this.roles)
          ? this.roles
          : [];
      return roles.filter(role => ROLE_TEAMS.includes(role.team));
    },
    // 阵容 tab：全部 + 四个阵营，文字取自 stores 的 teamsNames
    tabs() {
      const names = this.$store.state.teamsNames || {};
      return [
        { key: "all", label: "全部" },
        ...ROLE_TEAMS.map(t => ({ key: t, label: names[t] || t }))
      ];
    },
    // 已上场的牌 → 座位号（给「已在场」标记和「只看不在场」用）
    usage() {
      const map = new Map();
      (this.players || []).forEach((player, index) => {
        const roleId = player && player.role && player.role.id;
        if (!roleId) return;
        const seats = map.get(String(roleId)) || [];
        seats.push(index + 1);
        map.set(String(roleId), seats);
      });
      return map;
    },
    // 选择器里实际显示的角色，按搜索词 / 阵营 / 只看不在场过滤
    list() {
      let list = this.allRoles;
      if (this.team !== "all") list = list.filter(role => role.team === this.team);
      if (this.hideUsed) list = list.filter(role => !this.usage.has(String(role.id)));
      const kw = (this.search || "").trim();
      if (kw) {
        const low = kw.toLowerCase();
        list = list.filter(
          role =>
            (role.name || "").toLowerCase().includes(low) ||
            (role.ability || "").toLowerCase().includes(low)
        );
      }
      return list;
    },
    activeDef() {
      return slotDef(this.phrase, this.active);
    },
    activeType() {
      return this.activeDef ? this.activeDef.type : "";
    },
    filledCount() {
      return Object.keys(this.picked).filter(key => this.picked[key]).length;
    },
    /** 座位号的可选范围：1–当前魔典最大座位号 */
    maxSeat() {
      return Math.max((this.players || []).length, 1);
    },
    /** 当前这一格是不是「可留空」（绿色边框） */
    activeOptional() {
      const def = slotDef(this.phrase, this.active);
      return !!(def && def.optional);
    },
    /**
     * 必填的空位都填上才能展示；
     * minFilled 表示「几格都可不填，但至少得填几格」（「你是…的…」是 1）
     */
    ready() {
      const slots = (this.phrase && this.phrase.slots) || [];
      if (slots.some(slot => !slot.optional && !this.picked[slot.key])) return false;
      const min = Number(this.phrase && this.phrase.minFilled) || 0;
      return this.filledCount >= min;
    }
  },
  watch: {
    // 关闭弹窗后复位，下次打开重新从列表开始
    "modals.quick"(isOpen) {
      if (!isOpen) {
        this.current = null;
        this.showing = false;
        this.picked = {};
        this.active = "";
        this.search = "";
        this.team = "all";
        this.hideUsed = false;
      }
    }
  },
  methods: {
    isSlot,
    slotType,
    slotKey,
    slotLabel,
    /** 列表里一句话的纯文字预览（空位用 ⟦…⟧ 占位） */
    previewText(item) {
      return item.seg
        .map(seg => (isSlot(seg) ? `⟦${slotLabel(slotType(seg))}⟧` : seg))
        .join("");
    },
    openPhrase(item) {
      this.current = item;
      this.picked = defaultPicked(item);
      this.search = "";
      this.team = "all";
      this.hideUsed = item.onlyUnused === true;
      this.showing = false;
      this.active = item.firstSlot || this.firstEmpty();
    },
    close() {
      this.current = null;
      this.showing = false;
      this.$store.commit("toggleModal", "quick");
    },
    isOptional(seg) {
      const def = slotDef(this.phrase, slotKey(seg));
      return !!(def && def.optional);
    },
    firstEmpty() {
      const slots = (this.phrase && this.phrase.slots) || [];
      const empty = slots.find(slot => !this.picked[slot.key]);
      return (empty || slots[0] || {}).key || "";
    },
    teamLabel(team) {
      const names = this.$store.state.teamsNames || {};
      return names[team] || team;
    },
    usedBy(role) {
      const seats = this.usage.get(String(role.id));
      return seats ? seats.join("、") : "";
    },
    isPicked(role) {
      return Object.keys(this.picked).some(
        key => this.picked[key] && this.picked[key].id === role.id
      );
    },
    pickRole(role) {
      // 只往「角色」格里写角色对象，避免类型错配时把牌塞进座位号 / 数字格
      if (!this.active || this.activeType !== "role") return;
      this.$set(this.picked, this.active, role);
      this.active = this.firstEmpty();
    },
    pickAlign(value) {
      if (!this.active || this.activeType !== "align") return;
      this.$set(this.picked, this.active, value);
      this.active = this.firstEmpty();
    },
    pickNum(n) {
      if (!this.active) return;
      if (this.activeType !== "num" && this.activeType !== "seat") return;
      this.$set(this.picked, this.active, n);
      this.active = this.firstEmpty();
    },
    /** 把当前这一格清空（只对可留空的格子显示入口） */
    clearActive() {
      if (!this.active) return;
      this.$delete(this.picked, this.active);
    },
    reset() {
      this.picked = defaultPicked(this.phrase);
      this.active = this.phrase.firstSlot || this.firstEmpty();
      this.showing = false;
    },
    show() {
      if (!this.ready) return;
      this.showing = true;
    },
    closeShow() {
      this.showing = false;
    }
  }
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

.qw-layer {
  .qw-panel {
    min-width: min(720px, 92vw);
    max-width: 92vw;
  }

  .qw-head {
    text-align: center;
    margin-bottom: 12px;
    h3 {
      margin: 4px 0;
    }
    p {
      margin: 0;
      opacity: 0.7;
      font-size: 90%;
    }
  }

  /* 短语列表（第一步） */
  .qw-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 60vh;
    overflow-y: auto;
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      cursor: pointer;
      transition: background 150ms, border-color 150ms;
      &:hover {
        background: rgba(255, 215, 94, 0.18);
        border-color: #ffd75e;
      }
    }
    .qw-list-idx {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 215, 94, 0.9);
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 80%;
      font-weight: bold;
    }
    .qw-list-text {
      flex: 1;
      min-width: 0;
      word-break: break-word;
      line-height: 1.5;
    }
  }
  .qw-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 85%;
  }

  /* 一句话预览 */
  .qw-line {
    display: flex;
    flex-wrap: wrap;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    font-size: 120%;
    line-height: 1.6;
  }
  .qw-text {
    white-space: normal;
    word-break: break-word;
  }
  .qw-chip {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    min-width: 54px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    cursor: pointer;
    transition: border-color 150ms;
    &.optional {
      border-color: rgba(80, 220, 120, 0.75);
    }
    &.active {
      box-shadow: 0 0 0 2px #ffd75e;
    }
    &.filled {
      background: rgba(255, 255, 255, 0.1);
    }
    .qw-chip-token {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      .token {
        width: 40px;
        height: 40px;
      }
    }
    .qw-chip-align {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-weight: bold;
      img {
        width: 18px;
        height: 18px;
        object-fit: contain;
      }
      &.good {
        color: #46d5ff;
      }
      &.evil {
        color: #ce0100;
      }
    }
    .qw-chip-num {
      font-weight: bold;
      font-size: 120%;
    }
    .qw-chip-name {
      font-size: 80%;
      white-space: nowrap;
    }
    .qw-chip-opt {
      position: absolute;
      top: -8px;
      right: -6px;
      padding: 0 4px;
      border-radius: 6px;
      background: rgba(80, 220, 120, 0.85);
      color: #000;
      font-size: 10px;
      line-height: 1.4;
    }
  }

  .qw-picker {
    margin-top: 14px;
  }

  .qw-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    justify-content: center;
    margin-bottom: 8px;
  }
  .qw-search {
    flex: 1 1 180px;
    max-width: 260px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
  }
  .qw-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .qw-tab {
    padding: 5px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: transparent;
    color: inherit;
    cursor: pointer;
    &.on {
      background: rgba(255, 215, 94, 0.9);
      color: #000;
      border-color: #ffd75e;
    }
  }
  .qw-count {
    text-align: center;
    font-size: 85%;
    opacity: 0.75;
    margin: 4px 0 8px;
    .qw-tip {
      margin-left: 6px;
      opacity: 0.7;
    }
  }

  /* 角色网格：沿用城镇广场的圆牌风格 */
  ul.tokens {
    max-width: none;
    margin: 0 auto;
    li {
      border-radius: 50%;
      margin: 5px;
      width: clamp(52px, 7vw, 72px);
      flex: none;
      opacity: 0.7;
      transition: all 250ms;
      cursor: pointer;
      &.current {
        opacity: 1;
        box-shadow: 0 0 0 3px #ffd75e, 0 0 14px rgba(255, 215, 94, 0.6);
      }
      &.used {
        opacity: 0.95;
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
      &:hover {
        transform: scale(1.15);
        z-index: 10;
        opacity: 1;
      }
    }
  }
  .qw-empty {
    text-align: center;
    opacity: 0.7;
  }

  .qw-align {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 16px;
    .qw-align-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 16px 40px;
      border-radius: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: rgba(0, 0, 0, 0.35);
      color: inherit;
      font-size: 140%;
      cursor: pointer;
      .qw-align-thumb {
        width: 40px;
        height: 40px;
        object-fit: contain;
      }
      &.good {
        color: #46d5ff;
        &.on {
          background: rgba(70, 213, 255, 0.25);
          border-color: #46d5ff;
        }
      }
      &.evil {
        color: #ce0100;
        &.on {
          background: rgba(206, 1, 0, 0.25);
          border-color: #ce0100;
        }
      }
    }
  }

  .qw-nums {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 12px;
  }
  .qw-num {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    cursor: pointer;
    &.on {
      background: rgba(255, 215, 94, 0.9);
      color: #000;
      border-color: #ffd75e;
    }
  }

  .qw-slot-clear {
    text-align: center;
    margin-top: 8px;
    .qw-clear-btn {
      padding: 5px 12px;
      border-radius: 8px;
      border: 1px solid rgba(80, 220, 120, 0.6);
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .qw-clear-tip {
      margin-left: 8px;
      font-size: 80%;
      opacity: 0.7;
    }
  }

  .qw-plain {
    text-align: center;
    opacity: 0.8;
    padding: 16px;
  }

  .qw-actions {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 16px;
    .qw-btn {
      padding: 8px 20px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 215, 94, 0.9);
      color: #000;
      font-weight: bold;
      cursor: pointer;
      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      &.ghost {
        background: transparent;
        color: inherit;
      }
    }
  }

  /* 全屏展示 */
  .qw-show {
    position: fixed;
    inset: 0;
    z-index: 400;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 30px;
    cursor: pointer;
    padding: 5vh 5vw;
  }
  .qws-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-size: clamp(28px, 6vw, 64px);
    line-height: 1.4;
    text-align: center;
  }
  .qws-role {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    .token {
      width: clamp(90px, 16vw, 160px);
      height: clamp(90px, 16vw, 160px);
    }
    b {
      font-size: 60%;
    }
  }
  .qws-align {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    img {
      width: clamp(40px, 6vw, 70px);
      height: clamp(40px, 6vw, 70px);
      object-fit: contain;
    }
    &.good {
      color: #46d5ff;
    }
    &.evil {
      color: #ce0100;
    }
  }
  .qws-num {
    font-weight: bold;
  }
  .qws-seat {
    font-weight: bold;
  }
  .qws-hint {
    opacity: 0.6;
    font-size: clamp(14px, 2vw, 20px);
  }
}

.panel-fade-enter,
.panel-fade-leave-active {
  opacity: 0;
}
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease;
}
</style>
