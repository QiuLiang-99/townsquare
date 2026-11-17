<template>
  <div class="world-lobby">
    <h2 class="wl-title">
      <font-awesome-icon icon="globe" /> 世界大厅
      <span class="wl-count">{{ rooms.length }}</span>
    </h2>

    <div class="wl-body">
      <p v-if="!rooms.length" class="wl-empty">
        暂无开启的房间。点击右上角菜单「创建房间」<em>[H]</em> 开始说书吧。
      </p>

      <ul v-else class="wl-list">
        <li
          v-for="room in rooms"
          :key="room.channel"
          class="wl-item"
          @click="enterRoom(room)"
          :title="`点击加入房间 ${room.channel}`"
        >
          <div class="wl-cover">
            <img
              :src="coverSrc(room)"
              :alt="editionName(room.edition, room.editionName)"
              @error="onCoverError(room)"
            />
          </div>
          <div class="wl-info">
            <div class="wl-name">{{ room.name || room.channel }}</div>
            <div class="wl-edition">{{ editionName(room.edition, room.editionName) }}</div>
            <div class="wl-meta">
              <span class="wl-cell"><font-awesome-icon icon="users" /> {{ room.players }}/{{ room.maxPlayers || room.players }}</span>
              <span class="wl-cell"><font-awesome-icon icon="hashtag" /> {{ room.channel }}</span>
            </div>
            <div class="wl-st" v-if="room.stName">
              <font-awesome-icon icon="user-tie" /> {{ room.stName }}
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex";
import editionsJSON from "../editions.json";

const EDITIONS = new Map(editionsJSON.map((e) => [e.id, e]));

export default {
  name: "WorldLobby",
  data() {
    return {
      // 外链封面加载失败的房间，退回内置剧本封面
      coverErrors: {}
    };
  },
  computed: {
    ...mapState("lobby", ["roomList"]),
    rooms() {
      return this.roomList || [];
    },
  },
  methods: {
    editionName(id, customName) {
      const edition = EDITIONS.get(id);
      if (edition) return edition.name;
      return customName || id || "未选择剧本";
    },
    editionImage(id) {
      try {
        return require(`../assets/editions/${id || "custom"}.png`);
      } catch (e) {
        return require("../assets/editions/custom.png");
      }
    },
    coverSrc(room) {
      const channel = String(room.channel);
      if (room.editionLogo && !this.coverErrors[channel]) return room.editionLogo;
      return this.editionImage(room.edition);
    },
    onCoverError(room) {
      const channel = String(room.channel);
      if (!room.editionLogo || this.coverErrors[channel]) return;
      this.$set(this.coverErrors, channel, true);
    },
    enterRoom(room) {
      this.$emit("enterRoom", room);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

.world-lobby {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 12vh;
  width: min(880px, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.66);
  border: 3px solid black;
  border-radius: 12px;
  padding: 14px 18px;
  z-index: 3;
  color: #f2e6c8;
}

.wl-title {
  font-family: "Upheaval", sans-serif;
  font-size: 150%;
  margin: 4px 0 12px;
  color: #f4d47c;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.wl-count {
  font-size: 70%;
  background: rgba(244, 212, 124, 0.18);
  border: 1px solid rgba(244, 212, 124, 0.6);
  border-radius: 10px;
  padding: 1px 10px;
}

.wl-body {
  overflow-y: auto;
}
.wl-empty {
  opacity: 0.8;
  padding: 20px 4px;
  em {
    color: #f4d47c;
    font-style: normal;
  }
}

.wl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.wl-item {
  display: flex;
  gap: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: #f4d47c;
    transform: translateY(-1px);
  }
}

.wl-cover {
  flex: none;
  // 剧本封面多为横幅/长条图，用 contain 保留完整封面。
  width: 104px;
  height: 74px;
  border-radius: 8px;
  overflow: hidden;
  background: #0b0b0b;
  box-shadow: 0 0 6px black;
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.wl-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wl-name {
  font-weight: bold;
  font-size: 108%;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wl-edition {
  font-size: 88%;
  color: #b9d7ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wl-meta {
  display: flex;
  gap: 12px;
  font-size: 86%;
  opacity: 0.85;
}
.wl-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.wl-st {
  font-size: 86%;
  opacity: 0.8;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
