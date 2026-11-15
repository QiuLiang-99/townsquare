<template>
  <Modal
    v-if="session.blindDrawActive"
    @close="close"
    name="blindDraw"
    class="blind-draw"
    :dismissible="false"
    force-maximized
  >
    <h3>盲抽角色</h3>
    <p class="bd-tip" v-if="!session.isSpectator">
      请所有玩家依次抽取一个角色。已被抽走的牌会显示抽取者，无法再被选择。
    </p>
    <p class="bd-tip" v-else>
      请点击一张牌抽取你的角色。
    </p>

    <!-- 牌堆：blindDrawCount 个槽位。玩家端只知道槽位数，不知道每张牌是什么角色 -->
    <ul class="bd-tokens" :style="gridStyle">
      <li
        v-for="slot in slotRange"
        :key="slot"
        :style="cardStyle"
        :class="{
          taken: isTaken(slot),
          mine: isMine(slot),
          pickable: canPick(slot)
        }"
        @click="onSlotClick(slot)"
      >
        <!-- 本人抽到的牌：直接展示自己的角色 -->
        <template v-if="isMine(slot) && myRole">
          <Token :role="myRole" :show-corner="false" />
        </template>

        <!-- 已被别人抽走：黑色牌背(death.png)，正中显示抽取者 名/N号 -->
        <template v-else-if="isTaken(slot)">
          <div class="bd-black">
            <div class="bd-black-label">
              <span class="bd-name">{{ takenOf(slot).name }}</span>
              <span class="bd-seat">{{ takenOf(slot).seat + 1 }}号</span>
            </div>
          </div>
        </template>

        <!-- 未抽走：未知牌背 -->
        <template v-else>
          <div class="life"></div>
        </template>
      </li>
    </ul>

    <!-- 说书人底部操作 -->
    <div class="bd-actions" v-if="!session.isSpectator">
      <span class="button" @click="finishDraw">
        <span v-if="allDrawn">分配已抽取角色至魔典</span>
        <span v-else>随机分配剩余角色</span>
      </span>
    </div>

    <!-- 玩家：抽到大牌覆盖层，点确定收起，大窗口不关 -->
    <transition name="bd-reveal-fade">
      <div class="bd-reveal-full" v-if="showMyReveal && revealRole">
        <ul class="bd-reveal-card">
          <Token :role="revealRole" :show-corner="false" :style="revealStyle" />
        </ul>
        <p class="bd-reveal-tip">请记住你的角色，点击下方按钮继续</p>
        <span class="button" @click="confirmReveal">确定</span>
      </div>
    </transition>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from "vuex";
import Modal from "./Modal";
import Token from "../Token";

export default {
  components: { Token, Modal },
  data() {
    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      // 是否正在展示"我抽到的牌"大图（reactive）
      revealOpen: false
    };
  },
  computed: {
    slotCount() {
      return this.session.blindDrawCount || 0;
    },
    /** 0 基槽位下标数组，供 v-for 使用（角色/taken 均以 0 为下标） */
    slotRange() {
      return Array.from({ length: this.slotCount }, (_, i) => i);
    },
    /** 本玩家抽到的角色对象（仅玩家端有值） */
    myRole() {
      const pick = this.session.blindDrawMyPick;
      return pick && pick.role && pick.role.id ? pick.role : null;
    },
    /** 本玩家抽到的槽位：优先看本地 pick，否则按 taken 表里的 playerId 比对 */
    mySlot() {
      const pick = this.session.blindDrawMyPick;
      if (pick && typeof pick.slot === "number") return pick.slot;
      const taken = this.session.blindDrawTaken || [];
      const myId = this.session.playerId;
      if (!myId) return -1;
      const rec = taken.find(t => t.playerId === myId);
      return rec ? rec.slot : -1;
    },
    /** 玩家是否正在看"自己抽到的牌"的大图覆盖层（点确定收起） */
    showMyReveal() {
      return this.revealOpen && !!this.myRole;
    },
    mySeat() {
      const myId = this.session.playerId;
      const idx = this.players.findIndex(p => p.id && p.id === myId);
      return idx;
    },
    allDrawn() {
      return this.slotCount > 0 && (this.session.blindDrawTaken || []).length >= this.slotCount;
    },
    revealRole() {
      return this.myRole;
    },
    cols() {
      const n = this.slotCount;
      if (n <= 3) return Math.max(1, n);
      let cols = Math.ceil(Math.sqrt(n));
      if (n % cols === 1) cols += 1;
      return Math.min(6, cols);
    },
    rows() {
      return Math.ceil(this.slotCount / this.cols) || 1;
    },
    cardSize() {
      const gap = 12;
      const byWidth = (this.windowWidth * 0.86 - gap * (this.cols - 1)) / this.cols;
      const byHeight = (this.windowHeight * 0.62 - gap * (this.rows - 1)) / this.rows;
      return Math.max(58, Math.min(126, Math.floor(Math.min(byWidth, byHeight))));
    },
    gridStyle() {
      return {
        maxWidth: `${this.cols * this.cardSize + 12 * (this.cols - 1)}px`
      };
    },
    cardStyle() {
      return { width: `${this.cardSize}px` };
    },
    revealSize() {
      return Math.max(
        150,
        Math.floor(Math.min(this.windowWidth * 0.8, this.windowHeight * 0.6, 430))
      );
    },
    revealStyle() {
      return { width: `${this.revealSize}px` };
    },
    ...mapState(["modals", "session"]),
    ...mapState("players", ["players"])
  },
  mounted() {
    window.addEventListener("resize", this.handleResize);
    // 若打开时玩家已经抽过（例如重连），默认不弹大图，等人点击自己那张牌再看
    this.revealOpen = false;
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize);
  },
  watch: {
    // 玩家收到说书人私发的角色 → 自动亮牌
    "session.blindDrawMyPick"(pick) {
      if (pick && pick.role && pick.role.id) this.revealOpen = true;
    }
  },
  methods: {
    handleResize() {
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    takenOf(slot) {
      return (this.session.blindDrawTaken || []).find(t => t.slot === slot) || {};
    },
    isTaken(slot) {
      return (this.session.blindDrawTaken || []).some(t => t.slot === slot);
    },
    isMine(slot) {
      return this.mySlot === slot && !!this.myRole;
    },
    /** 玩家可点：未抽取、且自己没有抽过 */
    canPick(slot) {
      if (!this.session.isSpectator) return false; // 说书人不抽
      if (this.mySlot >= 0) return false; // 每人只抽一次
      return !this.isTaken(slot);
    },
    onSlotClick(slot) {
      if (!this.canPick(slot)) return;
      // 若已经抽过，点自己那块牌只是再看一眼
      if (this.mySlot === slot && this.myRole) {
        this.revealOpen = true;
        return;
      }
      // 请求说书人下发该槽位角色（点对点，不广播）
      this.$store.commit("session/blindDrawPick", slot);
    },
    confirmReveal() {
      this.revealOpen = false;
    },
    finishDraw() {
      // 说书人：把所有角色按抽取顺序分配；未抽完的剩余槽位随机补齐
      this.$store.commit("session/blindDrawFinish");
      this.close();
    },
    close() {
      // 说书人结束/关闭盲抽 → 清空状态并广播关闭
      this.$store.commit("session/setBlindDrawActive", false);
      this.toggleModal("blindDraw");
    },
    ...mapMutations(["toggleModal"])
  }
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

ul.bd-tokens {
  align-content: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  max-width: none;
  margin: 0 auto;
  li {
    border-radius: 50%;
    margin: 0;
    padding: 0;
    position: relative;
    flex: none;
    aspect-ratio: 1 / 1;
    transition: transform 200ms;
    .life,
    .bd-black {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background-size: 100% 100%;
      border: 3px solid black;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
    .life {
      background-image: url("../../assets/life.png");
      background-position: center;
    }
    &.pickable {
      cursor: pointer;
    }
    &.pickable .life:hover {
      transform: scale(1.08);
    }
    &.taken .life,
    &.mine .life {
      cursor: default;
    }
    /* 黑色牌背：死亡牌(death.png) + 正中显示抽取者名/N号 */
    .bd-black {
      background-image: url("../../assets/death.png");
      background-position: center;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.6);
      .bd-black-label {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: #fff;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 1);
        pointer-events: none;
        padding: 4px;
        .bd-name {
          font-weight: bold;
          font-size: clamp(9px, 1.1vw, 15px);
          line-height: 1.1;
          word-break: break-all;
        }
        .bd-seat {
          font-size: clamp(8px, 0.9vw, 13px);
          opacity: 0.9;
        }
      }
    }
  }
}

.bd-tip {
  text-align: center;
  margin: 0 0 12px;
}

.bd-actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* 玩家抽到大牌覆盖层 */
.bd-reveal-full {
  position: fixed;
  inset: 0;
  z-index: 600;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  ul.bd-reveal-card {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    justify-content: center;
  }
  .bd-reveal-tip {
    color: #fff;
    margin: 16px 0;
  }
}
.bd-reveal-fade-enter-active,
.bd-reveal-fade-leave-active {
  transition: opacity 200ms;
}
.bd-reveal-fade-enter,
.bd-reveal-fade-leave-to {
  opacity: 0;
}
</style>
