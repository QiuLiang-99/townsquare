<template>
  <Modal v-if="modals.draw" @close="close" name="draw" class="roles">
    <h3>
      请抽取角色
    </h3>
    <!-- 牌数决定排几列（见 cols），整个牌子块居中，窗口本身也随内容收紧 -->
    <ul class="tokens" :style="gridStyle">
      <li
        v-for="role in session.drawRoles"
        v-show="Object.keys(displayRole).length === 0"
        :key="role.id"
        @click="storeRole(role)"
        :style="cardStyle"
      >
        <!-- 盲抽是给玩家看的：牌背与亮出的牌都不能带认知覆盖角标 -->
        <Token style="visibility: hidden" :role="role" :show-corner="false" />
        <div class="life"></div>
      </li>
    </ul>
    <ul class="reveal" v-if="Object.keys(displayRole).length !== 0">
      <Token :role="displayRole" :show-corner="false" :style="revealStyle" />
    </ul>
    <div class="multiple">
      <span v-if="Object.keys(displayRole).length === 0">
        <span v-if="drawnRoles.length !== nonTravelerLength">请为{{ drawingIndex+1 + nextConsecutiveTravelerNumber }}号抽取身份</span>
      </span>
      <span v-else>请点击确认后交给
        <span v-if="drawnRoles.length === nonTravelerLength">说书人</span>
        <span v-else>下一名玩家</span>
      </span>
    </div>
    <div
      class="button-group"
      v-if="otherTravelers.size && !session.isSpectator"
    >
      <span 
        class="button"
        v-if="Object.keys(displayRole).length === 0"
        @click="finishDraw()"
      >
        <span v-if="drawnRoles.length === nonTravelerLength">分配已抽取角色至魔典</span>
        <span v-else>随机分配剩余角色</span>
      </span>
      <span 
        class="button"
        v-else
        @click="nextRole()"
      >
        确定
      </span>
    </div>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from "vuex";
import Modal from "./Modal";
import Token from "../Token";
import { identityReminders } from "../../logic/reminders";

export default {
  components: { Token, Modal },
  props: ["playerIndex"],
  computed: {
    /** 这一轮还没被抽走的牌数（= 要摆出来的牌数） */
    drawCount() {
      return (this.session.drawRoles || []).length;
    },
    /**
     * 按数量决定排几列：先取平方根让行列接近，末行只剩 1 张时多给一列
     * （7 张 → 4+3，不是 6+1 那种孤零零的一行）。
     */
    cols() {
      const n = this.drawCount;
      if (n <= 3) return Math.max(1, n);
      let cols = Math.ceil(Math.sqrt(n));
      if (n % cols === 1) cols += 1;
      return Math.min(6, cols);
    },
    rows() {
      return Math.ceil(this.drawCount / this.cols) || 1;
    },
    /** 牌的大小：宽高都要塞得下，牌少就大一点，牌多就小一点 */
    cardSize() {
      const gap = 12;
      const byWidth = (this.windowWidth * 0.86 - gap * (this.cols - 1)) / this.cols;
      const byHeight = (this.windowHeight * 0.62 - gap * (this.rows - 1)) / this.rows;
      return Math.max(58, Math.min(126, Math.floor(Math.min(byWidth, byHeight))));
    },
    /**
     * 牌背容器：宽度正好装下 cols 列。
     * 保持全局的 flex 换行 + justify-content:center —— 这样每一行
     * （包括末行剩下的牌）都会自动居中，不会出现 6+1 那种靠左的孤行。
     */
    gridStyle() {
      return {
        maxWidth: `${this.cols * this.cardSize + 12 * (this.cols - 1)}px`
      };
    },
    cardStyle() {
      return { width: `${this.cardSize}px` };
    },
    /** 亮出来的一张牌：跟着视口走，电脑端别大到出屏，手机端也别顶满整屏 */
    revealSize() {
      return Math.max(
        150,
        Math.floor(Math.min(this.windowWidth * 0.8, this.windowHeight * 0.6, 430))
      );
    },
    revealStyle() {
      return { width: `${this.revealSize}px` };
    },
    nonTravelerLength() {
      return this.players.filter(player => player.role.team !== "traveler").length;
    },
    nextConsecutiveTravelerNumber() {
      let count = 0;
      const start = Math.max(0, this.drawingIndex || 0);
      for (let i = start; i < this.players.length; i++) {
        const player = this.players[i];
        if (!player) break;
        if (player.role && player.role.team === 'traveler') {
          count++;
        } else {
          break;
        }
      }
      return count;
    },
    ...mapState(["modals", "session"]),
    ...mapState("players", ["players"]),
    ...mapState(["otherTravelers"])
  },
  data() {
    return {
      displayRole: {},
      drawingIndex: 0,
      drawnRoles: [],
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  },
  mounted(){
    window.addEventListener("resize", this.handleResize);
    this.drawingIndex = Math.max(0, this.players.findIndex(player => player.role && player.role.team !== 'traveler'))
  },
  beforeDestroy(){
    window.removeEventListener("resize", this.handleResize);
  },
  watch: {
    // 本组件在页面加载时即挂载，那时座位上可能还没有玩家或角色；
    // 打开抽取窗口时重新定位起始座位并清空临时状态（原版缺此逻辑会导致越界/错位）
    "modals.draw"(isOpen) {
      if (!isOpen) return;
      this.displayRole = {};
      this.drawnRoles = [];
      this.drawingIndex = Math.max(
        0,
        this.players.findIndex(player => player.role && player.role.team !== "traveler")
      );
    }
  },
  methods: {
    handleResize(){
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    storeRole(role) {
      if (Object.keys(this.displayRole).length > 0) this.displayRole = {};
      const index = this.session.drawRoles.indexOf(role);
      if (index < 0) return;
      this.displayRole = this.session.drawRoles.splice(index, 1)[0];
      this.drawnRoles.push(this.displayRole);
    },
    nextRole() {
      this.displayRole = {};
      this.drawingIndex = this.drawingIndex + 1;
      while (this.drawingIndex < this.players.length && this.players[this.drawingIndex] && this.players[this.drawingIndex].role && this.players[this.drawingIndex].role.team === 'traveler') this.drawingIndex = this.drawingIndex + 1;
    },
    finishDraw() {
      const drawnRoles = [...this.drawnRoles, ...this.session.drawRoles];
      let skip = 0;
      for (let i=0; i<drawnRoles.length; i++) {
        while (i+skip < this.players.length && this.players[i+skip] && this.players[i+skip].role && this.players[i+skip].role.team === "traveler") skip++;
        const player = this.players[i+skip];
        if (!player) continue;
        this.$store.commit("players/update", {
          player,
          property: "role",
          value: drawnRoles[i]
        });
        // 新抽的一批角色：清掉上一局的死亡状态与提示标记。
        // 认知覆盖的座位要自动带上真实身份的全局标记（酒鬼 → 「是酒鬼」）
        this.$store.commit("players/update", {
          player,
          property: "isDead",
          value: false
        });
        this.$store.commit("players/update", {
          player,
          property: "reminders",
          value: identityReminders(drawnRoles[i], this.$store.state.roles)
        });
      }
      this.close();
    },
    close() {
      this.displayRole = {};
      this.drawingIndex = 0;
      this.drawnRoles = [];
      this.$store.commit("session/setDrawRoles", []);
      this.toggleModal("draw");
    },
    ...mapMutations(["toggleModal"])
  }
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

ul.tokens {
  /* 布局沿用全局 .modal ul 的 flex 换行 + 居中（每行都居中），
     宽度由脚本按牌数算好锁住（max-width 内联），7 张就是 4+3 居中两行 */
  align-content: center;
  gap: 12px;
  max-width: none;
  margin: 0 auto;
  li {
    border-radius: 50%;
    margin: 0;
    transition: all 250ms;
    .buttons {
      display: none;
      position: absolute;
      top: 95%;
      text-align: center;
      width: 100%;
      z-index: 30;
      filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
    }
  }
  .life {
    border-radius: 50%;
    width: 100%;
    background: url("../../assets/life.png") center center;
    background-size: 100%;
    border: 3px solid black;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    position: absolute;
    left: 0;
    top: 0;

    &:before {
      content: " ";
      display: block;
      padding-top: 100%;
    }

    &:hover {
      transform: scale(1.2);
    }
  }
}
.roles .modal {
  .multiple {
    display: block;
    text-align: center;
  }
}
</style>
