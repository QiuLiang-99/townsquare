<template>
  <div class="token" @click="setRole" :class="[role.id, { 'hide-corner': !showCorner }]" 
  :style="tokenBackground"
  >
    <span
      class="icon"
      v-if="role.id"
      :style="{
        backgroundImage: `url(${
          role.image && grimoire.isImageOptIn
            ? role.image
            : require('../assets/icons/' + (role.imageAlt || role.id.replace(/old1$/, '')) + '.png')
        })`
      }"
    ></span>
    <span
      class="leaf-left"
      v-if="role.firstNight || role.firstNightReminder"
    ></span>
    <span
      class="leaf-right"
      v-if="role.otherNight || role.otherNightReminder"
    ></span>
    <span v-if="reminderLeaves" :class="['leaf-top' + reminderLeaves]"></span>
    <span class="leaf-orange" v-if="role.setup"></span>
    <svg viewBox="0 0 150 150" class="name">
      <path
        d="M 13 75 C 13 160, 138 160, 138 75"
        id="curve"
        fill="transparent"
      />
      <text
        width="150"
        x="66.6%"
        text-anchor="middle"
        class="label mozilla"
        :font-size="role.name | nameToFontSize"
      >
        <textPath xlink:href="#curve">
          {{ role.name }}
        </textPath>
      </text>
    </svg>
    <div class="edition" :class="[`edition-${role.edition}`, role.team]"></div>
    <div class="setup-tag" v-if="tag" :title="tagTitle">{{ tag }}</div>
    <div class="ability" v-if="role.ability">
      {{ role.ability }}
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  name: "Token",
  props: {
    role: {
      type: Object,
      default: () => ({})
    },
    id: {
      type: String,
      default: ""
    },
    image: {
      type: String,
      default: ""
    },
    // 角色右上角的设置调整角标（如「外来者 +2」）：空串则不显示
    tag: {
      type: String,
      default: ""
    },
    // 角标的悬停说明
    tagTitle: {
      type: String,
      default: ""
    },
    // 是否显示右上角角标：盲抽 / 亮牌给玩家看时传 false，避免泄露身份
    showCorner: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    reminderLeaves: function() {
      return (
        (this.role.reminders || []).length +
        (this.role.remindersGlobal || []).length
      );
    },
    tokenBackground() {
      return (!!this.id && !!this.image) ? {} : {backgroundImage: `url(${require('../assets/token.png')})`}
    },
    ...mapState(["grimoire"])
  },
  data() {
    return {};
  },
  filters: {
    nameToFontSize: name => (name && name.length > 10 ? "90%" : "110%")
  },
  methods: {
    setRole() {
      this.$emit("set-role");
    }
  }
};
</script>

<style scoped lang="scss">

.token {
  border-radius: 50%;
  width: 100%;
  // background: url("../assets/token.png") center center;
  background-size: 100%;
  text-align: center;
  border: 3px solid black;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 250ms;

  &:hover .name .label {
    stroke: black;
    fill: white;
    @-moz-document url-prefix() {
      &.mozilla {
        stroke: none;
        filter: drop-shadow(0 1.5px 0 black) drop-shadow(0 -1.5px 0 black)
          drop-shadow(1.5px 0 0 black) drop-shadow(-1.5px 0 0 black)
          drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
      }
    }
  }

  .icon,
  &:before {
    background-size: 100%;
    background-repeat: no-repeat;
    background-position: center 30%;
    border-radius: 50%;
    position: absolute;
    width: 100%;
    height: 100%;
    margin-top: 3%;
  }

  span {
    position: absolute;
    width: 100%;
    height: 100%;
    background-size: 100%;
    pointer-events: none;

    &.leaf-left {
      background-image: url("../assets/leaf-left.png");
    }

    &.leaf-orange {
      background-image: url("../assets/leaf-orange.png");
    }

    &.leaf-right {
      background-image: url("../assets/leaf-right.png");
    }

    &.leaf-top1 {
      background-image: url("../assets/leaf-top1.png");
    }

    &.leaf-top2 {
      background-image: url("../assets/leaf-top2.png");
    }

    &.leaf-top3 {
      background-image: url("../assets/leaf-top3.png");
    }

    &.leaf-top4 {
      background-image: url("../assets/leaf-top4.png");
    }

    &.leaf-top5 {
      background-image: url("../assets/leaf-top5.png");
    }
  }

  .name {
    width: 100%;
    height: 100%;
    font-size: 24px; // svg fonts are relative to document font size
    .label {
      fill: black;
      stroke: white;
      stroke-width: 2px;
      paint-order: stroke;
      font-family: "Papyrus", serif;
      font-weight: bold;
      text-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
      letter-spacing: 1px;

      @-moz-document url-prefix() {
        &.mozilla {
          // Vue doesn't support scoped media queries, so we have to use a second css class
          stroke: none;
          text-shadow: none;
          filter: drop-shadow(0 1.5px 0 white) drop-shadow(0 -1.5px 0 white)
            drop-shadow(1.5px 0 0 white) drop-shadow(-1.5px 0 0 white)
            drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
        }
      }
    }
  }

  .edition {
    position: absolute;
    right: 0;
    bottom: 5px;
    width: 30px;
    height: 30px;
    background-size: 100%;
    display: none;
  }

  // 设置调整角标：叠在角色牌右上角，标出这张牌实际带来的人数变化
  // show-corner=false（盲抽/亮牌场景）时整块隐藏，避免把角色身份泄露给玩家
  .setup-tag {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 12;
    padding: 1px 5px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(255, 175, 80, 0.75);
    color: #ffcf8a;
    font-size: 10px;
    line-height: 1.35;
    white-space: nowrap;
    pointer-events: none;
  }

  &.hide-corner {
    .setup-tag {
      display: none;
    }
  }

  .ability {
    display: flex;
    position: absolute;
    padding: 5px 10px;
    left: 120%;
    width: 250px;
    z-index: 25;
    font-size: 80%;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 10px;
    border: 3px solid black;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
    text-align: left;
    justify-items: center;
    align-content: center;
    align-items: center;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease-in-out;

    &:before {
      content: " ";
      border: 10px solid transparent;
      width: 0;
      height: 0;
      border-right-color: black;
      position: absolute;
      margin-right: 2px;
      right: 100%;
    }
  }

  &:hover .ability {
    opacity: 1;
  }
}
</style>
