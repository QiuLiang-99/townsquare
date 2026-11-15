<template>
  <Modal v-if="modals.directedWake" name="directed-wake" @close="close">
    <div class="dw-panel" v-if="target">
      <header class="dw-head">
        <div>
          <h3>快捷唤醒 · {{ target.seat }}号 {{ target.name }}</h3>
          <p>消息只会发送给这个玩家，不会进入普通私聊或群聊。</p>
        </div>
        <span class="dw-phase">{{ currentPhase.label }}</span>
      </header>

      <div class="dw-alert error" v-if="targetLeft">
        该玩家已离座，不能继续发送。已发出的消息仍保留在下方历史中。
      </div>
      <div class="dw-alert" v-if="session.isReconnecting">
        网络正在重连，发送任务会保留原消息 ID 并重试。
      </div>
      <div class="dw-alert error" v-if="!quickWake.connected">
        连接已断开，暂不能发送。重连后会重试未确认的消息。
      </div>
      <div class="dw-alert error" v-else-if="targetOffline">
        目标玩家已离线，暂不能发送。
      </div>
      <div class="dw-alert" v-if="quickWake.storageError">
        {{ quickWake.storageError }}
      </div>
      <div class="dw-alert error" v-if="quickWake.notice">
        {{ quickWake.notice }}
      </div>

      <WakeHistory :messages="history" />

      <div class="dw-grid">
        <section class="dw-section">
          <div class="dw-section-title">
            <h4>当前消息</h4>
            <button
              class="dw-link"
              @click="clearFragments"
              :disabled="!fragments.length"
            >
              清空
            </button>
          </div>
          <div class="dw-preview" :class="{ empty: !preview }">
            <template v-if="fragments.length">
              <button
                class="dw-fragment"
                v-for="(fragment, index) in fragments"
                :key="fragment.id"
                @click="removeFragment(index)"
                :title="'删除：' + fragment.text"
              >
                {{ fragment.text }} <span>×</span>
              </button>
            </template>
            <span v-else>从下方选择词语、玩家、角色或预设。</span>
          </div>

          <div class="dw-button-grid">
            <button
              v-for="word in quickWords"
              :key="word"
              @click="addFragment(word)"
            >
              {{ word }}
            </button>
            <button @click="openSelector('players')">玩家</button>
            <button @click="openSelector('roles')">角色</button>
            <button @click="customOpen = !customOpen">自定义文本</button>
            <button
              class="number"
              v-for="number in [0, 1, 2, 3, 4, 5]"
              :key="number"
              @click="addFragment(number)"
            >
              {{ number }}
            </button>
          </div>

          <div class="dw-picker" v-if="selector">
            <div class="dw-picker-head">
              <b>{{
                selector === "players" ? "按顺序选择玩家" : "按顺序选择角色"
              }}</b>
              <span
                >已选
                {{
                  selector === "players"
                    ? selectedPlayerIds.length
                    : selectedRoleIds.length
                }}
                项</span
              >
            </div>
            <div class="dw-choice-list" v-if="selector === 'players'">
              <button
                v-for="player in selectablePlayers"
                :key="player.id"
                :class="{ selected: selectedPlayerIds.includes(player.id) }"
                @click="toggleSelection(selectedPlayerIds, player.id)"
              >
                {{ player.seat }}. {{ player.name }}
                <span v-if="selectedPlayerIds.includes(player.id)">
                  {{ selectedPlayerIds.indexOf(player.id) + 1 }}
                </span>
              </button>
            </div>
            <div class="dw-choice-list roles" v-else>
              <button
                v-for="role in selectableRoles"
                :key="role.id"
                :class="{ selected: selectedRoleIds.includes(role.id) }"
                @click="toggleSelection(selectedRoleIds, role.id)"
              >
                {{ role.name }}
                <span v-if="selectedRoleIds.includes(role.id)">
                  {{ selectedRoleIds.indexOf(role.id) + 1 }}
                </span>
              </button>
            </div>
            <div class="dw-picker-actions">
              <button class="ghost" @click="selector = ''">取消</button>
              <button @click="confirmSelector">加入消息</button>
            </div>
          </div>

          <form class="dw-custom" v-if="customOpen" @submit.prevent="addCustom">
            <textarea
              v-model="customText"
              maxlength="500"
              placeholder="输入要发给玩家的纯文本"
              rows="3"
              @focus="$store.commit('session/setTyping', true)"
              @blur="$store.commit('session/setTyping', false)"
            ></textarea>
            <div class="dw-custom-actions">
              <button type="button" class="ghost" @click="customOpen = false">
                取消
              </button>
              <button type="submit" :disabled="!customText.trim()">
                加入消息
              </button>
            </div>
          </form>

          <div class="dw-send-row">
            <span v-if="targetLeft">玩家已离座，发送已禁用。</span>
            <span v-else-if="!preview">消息不能为空。</span>
            <button
              class="dw-send"
              :disabled="
                !preview || targetLeft || targetOffline || !quickWake.connected
              "
              @click="sendMessage"
            >
              <font-awesome-icon icon="paper-plane" />
              发送
            </button>
          </div>
        </section>

        <section class="dw-section">
          <div class="dw-section-title">
            <h4>我的预设</h4>
            <button class="dw-link" @click="deletingPresets = !deletingPresets">
              {{ deletingPresets ? "完成删除" : "删除预设" }}
            </button>
          </div>
          <form class="dw-preset-add" @submit.prevent="addPreset">
            <input
              v-model="presetText"
              maxlength="500"
              placeholder="新增常用文本"
            />
            <button
              type="submit"
              :disabled="!presetText.trim()"
              title="新增预设"
            >
              <font-awesome-icon icon="plus" />
            </button>
          </form>
          <p class="dw-empty" v-if="!quickWake.presets.length">
            预设保存在当前浏览器，跨房间可用。
          </p>
          <div class="dw-presets">
            <button
              v-for="(preset, index) in quickWake.presets"
              :key="preset + index"
              :class="{ deleting: deletingPresets }"
              @click="
                deletingPresets ? removePreset(index) : addFragment(preset)
              "
            >
              <font-awesome-icon
                :icon="deletingPresets ? 'trash-alt' : 'plus'"
              />
              <span>{{ preset }}</span>
            </button>
          </div>
        </section>
      </div>

      <section class="dw-section dw-phrases-section">
        <div class="dw-section-title">
          <h4>完整句式</h4>
          <button class="dw-link" v-if="phrase" @click="phrase = null">
            返回句式列表
          </button>
        </div>

        <div class="dw-phrase-list" v-if="!phrase">
          <button
            v-for="item in phrases"
            :key="item.key"
            @click="openPhrase(item)"
          >
            {{ phrasePreview(item) }}
          </button>
        </div>

        <div class="dw-phrase-editor" v-else>
          <div class="dw-phrase-line">
            <template v-for="(seg, index) in phrase.seg">
              <span :key="'text-' + index" v-if="!isSlot(seg)">{{ seg }}</span>
              <button
                v-else
                :key="'slot-' + index"
                :class="{
                  filled: !!picked[slotKey(seg)],
                  active: activeSlot === slotKey(seg),
                  optional: isOptional(seg),
                }"
                @click="activeSlot = slotKey(seg)"
              >
                {{ slotChoice(seg) }}
              </button>
            </template>
          </div>

          <div class="dw-phrase-options" v-if="activeDef">
            <template v-if="activeType === 'role'">
              <button
                v-for="role in selectableRoles"
                :key="role.id"
                :class="{
                  selected:
                    picked[activeSlot] && picked[activeSlot].id === role.id,
                }"
                @click="pickPhraseRole(role)"
              >
                {{ role.name }}
              </button>
            </template>
            <template v-else-if="activeType === 'align'">
              <button
                v-for="align in ['good', 'evil']"
                :key="align"
                :class="{ selected: picked[activeSlot] === align }"
                @click="pickPhraseValue(align)"
              >
                {{ ALIGN_LABEL[align] }}
              </button>
            </template>
            <template v-else-if="activeType === 'num'">
              <button
                v-for="number in phraseNumbers"
                :key="number"
                :class="{ selected: picked[activeSlot] === number }"
                @click="pickPhraseValue(number)"
              >
                {{ number }}
              </button>
            </template>
            <template v-else-if="activeType === 'seat'">
              <button
                v-for="number in players.length"
                :key="number"
                :class="{ selected: picked[activeSlot] === number }"
                @click="pickPhraseValue(number)"
              >
                {{ number }}号
              </button>
            </template>
            <button
              class="ghost"
              v-if="
                isOptional(phrase.slots.find((slot) => slot.key === activeSlot))
              "
              @click="$delete(picked, activeSlot)"
            >
              留空
            </button>
          </div>

          <div class="dw-phrase-actions">
            <span>{{ phraseText || "请填空" }}</span>
            <button :disabled="!phraseReady" @click="addPhrase">
              加入消息
            </button>
          </div>
        </div>
      </section>
    </div>
  </Modal>
</template>

<script>
import { mapState } from "vuex";
import Modal from "./Modal";
import WakeHistory from "./WakeHistory";
import {
  ALIGN_LABEL,
  QUICK_PHRASES,
  isSlot,
  slotDef,
  slotKey,
  slotLabel,
  slotType,
} from "../../logic/phrases";
import {
  composeText,
  createWakeMessage,
  makeId,
  normalizeText,
  phaseSnapshot,
} from "../../logic/quickWake";

const ROLE_TEAMS = ["townsfolk", "outsider", "minion", "demon", "traveler"];
const PHRASE_NUMBERS = Array.from({ length: 13 }, (_, index) => index);
const hasPhraseValue = (value) =>
  value !== undefined && value !== null && value !== "";

export default {
  name: "DirectedWakeModal",
  components: { Modal, WakeHistory },
  data() {
    return {
      fragments: [],
      customOpen: false,
      customText: "",
      selector: "",
      selectedPlayerIds: [],
      selectedRoleIds: [],
      deletingPresets: false,
      presetText: "",
      phrases: QUICK_PHRASES,
      phrase: null,
      picked: {},
      activeSlot: "",
      phraseNumbers: PHRASE_NUMBERS,
      ALIGN_LABEL,
    };
  },
  computed: {
    ...mapState(["modals", "session", "grimoire", "roles", "quickWake"]),
    ...mapState("players", ["players"]),
    target() {
      const chosen = this.quickWake.activeTarget;
      if (!chosen) return null;
      const live = this.players.find((player) => player.id === chosen.playerId);
      return {
        playerId: chosen.playerId,
        name: live ? live.name : chosen.name,
        seat: live ? this.players.indexOf(live) + 1 : chosen.seat,
        connected: !!live,
      };
    },
    targetOffline() {
      return (
        !!this.target &&
        !this.quickWake.onlinePlayerIds.includes(this.target.playerId)
      );
    },
    targetLeft() {
      return !!this.target && !this.target.connected;
    },
    history() {
      const targetId = this.target && this.target.playerId;
      if (!targetId) return [];
      return this.$store.getters["quickWake/sentForTarget"](targetId);
    },
    preview() {
      return composeText(this.fragments);
    },
    quickWords() {
      return ["了解", "是", "否", "善良", "邪恶"];
    },
    selectablePlayers() {
      return this.players
        .map((player, index) => ({ ...player, seat: index + 1 }))
        .filter((player) => !!player.id);
    },
    selectableRoles() {
      const values =
        this.roles instanceof Map
          ? Array.from(this.roles.values())
          : Array.isArray(this.roles)
          ? this.roles
          : [];
      return values
        .filter((role) => ROLE_TEAMS.includes(role.team))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-CN"));
    },
    currentPhase() {
      return phaseSnapshot(this.grimoire.isNight, this.grimoire.night);
    },
    activeDef() {
      return this.phrase && slotDef(this.phrase, this.activeSlot);
    },
    activeType() {
      return this.activeDef ? this.activeDef.type : "";
    },
    phraseText() {
      if (!this.phrase) return "";
      return this.phrase.seg
        .map((seg) => {
          if (!isSlot(seg)) return seg;
          const value = this.picked[slotKey(seg)];
          const type = slotType(seg);
          if (value === undefined || value === null || value === "") return "";
          if (type === "role") return value.name || "";
          if (type === "align")
            return `${ALIGN_LABEL[value] || value}${seg.suffix || ""}`;
          if (type === "seat") return `${value}号玩家`;
          return String(value);
        })
        .join("");
    },
    phraseReady() {
      if (!this.phrase || !this.phraseText) return false;
      const slots = this.phrase.slots || [];
      const requiredFilled = slots
        .filter((slot) => !slot.optional)
        .every((slot) => hasPhraseValue(this.picked[slot.key]));
      const minFilled = this.phrase.minFilled || 0;
      const filled = slots.filter((slot) =>
        hasPhraseValue(this.picked[slot.key]),
      ).length;
      return requiredFilled && filled >= minFilled;
    },
  },
  watch: {
    "modals.directedWake"(open) {
      if (!open) {
        this.$store.commit("session/setTyping", false);
        this.fragments = [];
        this.customOpen = false;
        this.customText = "";
        this.selector = "";
        this.selectedPlayerIds = [];
        this.selectedRoleIds = [];
        this.phrase = null;
        this.picked = {};
        this.presetText = "";
        this.deletingPresets = false;
      }
    },
    history: {
      handler() {
        this.$nextTick(this.scrollHistory);
      },
      deep: true,
    },
  },
  mounted() {
    this.$nextTick(this.scrollHistory);
  },
  methods: {
    isSlot,
    slotKey,
    slotType,
    close() {
      this.$store.commit("toggleModal", "directedWake");
      this.$store.commit("quickWake/closeTarget");
    },
    scrollHistory() {
      if (this.$refs.history)
        this.$refs.history.scrollTop = this.$refs.history.scrollHeight;
    },
    fragmentId() {
      return makeId("fragment");
    },
    addFragment(text) {
      const value = normalizeText(String(text), 1000);
      if (!value) return;
      this.fragments.push({ id: this.fragmentId(), text: value });
    },
    removeFragment(index) {
      this.fragments.splice(index, 1);
    },
    clearFragments() {
      this.fragments = [];
    },
    openSelector(type) {
      this.selector = type;
      this.selectedPlayerIds = [];
      this.selectedRoleIds = [];
      this.customOpen = false;
    },
    toggleSelection(list, id) {
      const index = list.indexOf(id);
      if (index >= 0) list.splice(index, 1);
      else list.push(id);
    },
    confirmSelector() {
      if (this.selector === "players") {
        this.selectedPlayerIds.forEach((id) => {
          const player = this.selectablePlayers.find((item) => item.id === id);
          if (player) this.addFragment(`${player.seat}号玩家 ${player.name}`);
        });
      } else if (this.selector === "roles") {
        this.selectedRoleIds.forEach((id) => {
          const role = this.selectableRoles.find((item) => item.id === id);
          if (role) this.addFragment(role.name);
        });
      }
      this.selector = "";
    },
    addCustom() {
      const text = normalizeText(this.customText, 500);
      if (!text) return;
      this.addFragment(text);
      this.customText = "";
      this.customOpen = false;
      this.$store.commit("session/setTyping", false);
    },
    addPreset() {
      const text = normalizeText(this.presetText, 500);
      if (!text) return;
      this.$store.commit("quickWake/addPreset", text);
      this.presetText = "";
    },
    removePreset(index) {
      this.$store.commit("quickWake/removePreset", index);
    },
    sendMessage() {
      if (
        !this.preview ||
        !this.target ||
        this.targetLeft ||
        this.targetOffline ||
        !this.quickWake.connected
      )
        return;
      try {
        const message = createWakeMessage({
          id: makeId("wake"),
          roomId: this.session.sessionId,
          senderPlayerId: this.session.playerId,
          senderName: this.session.playerName || "说书人",
          targetPlayerId: this.target.playerId,
          targetSeat: this.target.seat,
          targetName: this.target.name,
          phase: this.currentPhase,
          content: this.preview,
        });
        this.$store.commit("quickWake/setNotice", "");
        this.$store.commit("quickWake/enqueueMessage", message);
        this.fragments = [];
        this.$nextTick(this.scrollHistory);
      } catch (error) {
        this.$store.commit("quickWake/setNotice", error.message);
      }
    },
    statusLabel(status) {
      return (
        {
          sending: "发送中",
          accepted: "待玩家确认",
          delivered: "玩家已收到",
          replied: "已回复",
          failed: "发送失败",
        }[status] || status
      );
    },
    formatTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    phrasePreview(item) {
      return item.seg
        .map((seg) => (isSlot(seg) ? `[${slotLabel(slotType(seg))}]` : seg))
        .join("");
    },
    openPhrase(item) {
      this.phrase = item;
      this.picked = {};
      (item.slots || []).forEach((slot) => {
        if (slot.default !== undefined) this.picked[slot.key] = slot.default;
      });
      this.activeSlot = item.firstSlot || this.firstEmptySlot();
    },
    firstEmptySlot() {
      const empty = (this.phrase.slots || []).find(
        (slot) => !hasPhraseValue(this.picked[slot.key]),
      );
      return (empty || (this.phrase.slots || [])[0] || {}).key || "";
    },
    isOptional(seg) {
      const def =
        seg && seg.key ? seg : slotDef(this.phrase, slotKey(seg || {}));
      return !!(def && def.optional);
    },
    slotChoice(seg) {
      const value = this.picked[slotKey(seg)];
      const type = slotType(seg);
      if (value === undefined || value === null || value === "")
        return slotLabel(type);
      if (type === "role") return value.name;
      if (type === "align") return ALIGN_LABEL[value];
      if (type === "seat") return `${value}号`;
      return String(value);
    },
    pickPhraseRole(role) {
      if (this.activeType !== "role") return;
      this.$set(this.picked, this.activeSlot, role);
      this.activeSlot = this.firstEmptySlot();
    },
    pickPhraseValue(value) {
      if (!this.activeDef || this.activeType === "role") return;
      this.$set(this.picked, this.activeSlot, value);
      this.activeSlot = this.firstEmptySlot();
    },
    addPhrase() {
      if (!this.phraseReady) return;
      this.addFragment(this.phraseText);
      this.phrase = null;
      this.picked = {};
    },
  },
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

.dw-panel {
  width: min(980px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  color: #f4ecd8;
  padding: 4px 10px 12px;
}

.dw-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding: 4px 46px 14px 4px;

  h3 {
    margin: 0 0 6px;
    color: #d4b36b;
    font-size: 26px;
  }

  p {
    margin: 0;
    color: #bbb;
    font-size: 14px;
  }
}

.dw-phase {
  flex: 0 0 auto;
  border: 1px solid rgba(187, 145, 65, 0.55);
  border-radius: 999px;
  padding: 5px 12px;
  color: #d4b36b;
  background: rgba(0, 0, 0, 0.35);
}

.dw-alert {
  margin: 0 0 10px;
  border-radius: 8px;
  padding: 9px 12px;
  color: #e4d7b7;
  background: rgba(130, 105, 55, 0.25);
  font-size: 13px;

  &.error {
    color: #ffd8d2;
    background: rgba(150, 35, 35, 0.34);
  }
}

.dw-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
  gap: 14px;
}

.dw-section {
  margin-bottom: 14px;
  border: 1px solid rgba(187, 145, 65, 0.28);
  border-radius: 10px;
  padding: 12px;
  background: rgba(9, 9, 9, 0.48);
  min-width: 0;
}

.dw-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 9px;

  h4 {
    margin: 0;
    color: #d4b36b;
    font-size: 15px;
    letter-spacing: 0.04em;
  }

  > span {
    color: #999;
    font-size: 12px;
  }
}

button {
  font-family: inherit;
}

.dw-history {
  max-height: 230px;
  overflow-y: auto;
  padding-right: 5px;
}

.dw-history-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 9px 2px 11px;

  &:last-child {
    border-bottom: 0;
  }
}

.dw-history-meta,
.dw-reply-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #aaa;
  font-size: 12px;
}

.dw-phase-badge {
  border: 1px solid rgba(187, 145, 65, 0.45);
  border-radius: 5px;
  padding: 1px 5px;
  color: #d4b36b;
}

.dw-history-content {
  margin: 7px 0 0;
  color: #fff5d9;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dw-history-error {
  margin: 5px 0 0;
  color: #ffaaa0;
  font-size: 12px;
}

.dw-history-reply {
  margin-top: 8px;
  border-left: 3px solid rgba(121, 175, 114, 0.65);
  border-radius: 0 6px 6px 0;
  padding: 7px 9px;
  background: rgba(65, 105, 60, 0.2);

  p {
    margin: 5px 0 0;
    color: #dff3d8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.dw-status {
  margin-left: auto;
  color: #aaa;

  &.delivered {
    color: #b9d9ff;
  }

  &.replied {
    color: #a9e5a0;
  }

  &.failed {
    color: #ffaaa0;
  }
}

.dw-empty {
  margin: 7px 0;
  color: #888;
  font-size: 13px;
}

.dw-link {
  border: 0;
  background: transparent;
  color: #d4b36b;
  cursor: pointer;
  font-size: 12px;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.dw-preview {
  min-height: 62px;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  line-height: 1.5;

  &.empty {
    align-items: center;
    color: #888;
  }
}

.dw-fragment {
  border: 1px solid rgba(187, 145, 65, 0.42);
  border-radius: 8px;
  padding: 3px 7px;
  color: #f7e8be;
  background: rgba(111, 84, 29, 0.3);
  cursor: pointer;

  span {
    color: #ffaaa0;
    margin-left: 3px;
  }
}

.dw-button-grid,
.dw-picker,
.dw-phrase-options {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.dw-button-grid {
  margin-top: 9px;

  button {
    border: 1px solid rgba(187, 145, 65, 0.4);
    border-radius: 7px;
    padding: 7px 11px;
    color: #f3e4be;
    background: rgba(57, 46, 24, 0.7);
    cursor: pointer;

    &:hover {
      border-color: #d4b36b;
      background: rgba(100, 75, 25, 0.65);
    }

    &.number {
      min-width: 38px;
      font-size: 16px;
    }
  }
}

.dw-picker,
.dw-custom {
  margin-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 10px;
}

.dw-picker {
  display: block;
}

.dw-picker-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #ddd;
  font-size: 13px;
}

.dw-choice-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;

  button {
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 5px 8px;
    color: #ddd;
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;

    &.selected {
      color: #fff3cf;
      border-color: #d4b36b;
      background: rgba(124, 90, 25, 0.56);
    }

    span {
      margin-left: 5px;
      color: #9ee495;
    }
  }

  &.roles {
    max-height: 180px;
  }
}

.dw-picker-actions,
.dw-custom-actions,
.dw-send-row,
.dw-phrase-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.dw-picker-actions,
.dw-custom-actions {
  margin-top: 9px;
}

.dw-custom textarea,
.dw-preset-add input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;
  padding: 8px 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

.dw-picker-actions button,
.dw-custom-actions button,
.dw-phrase-actions button,
.dw-send,
.dw-preset-add button {
  border: 1px solid rgba(187, 145, 65, 0.55);
  border-radius: 7px;
  padding: 7px 12px;
  color: #281d08;
  background: #d4b36b;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &.ghost {
    color: #ddd;
    background: transparent;
  }
}

.dw-send-row {
  margin-top: 11px;
  min-height: 34px;

  > span {
    margin-right: auto;
    color: #999;
    font-size: 12px;
  }
}

.dw-send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 20px;
}

.dw-preset-add {
  display: flex;
  gap: 6px;

  button {
    flex: 0 0 36px;
    padding: 0;
  }
}

.dw-presets {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 230px;
  overflow-y: auto;
  margin-top: 9px;

  button {
    display: flex;
    gap: 7px;
    align-items: flex-start;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 7px 9px;
    color: #e9dfc7;
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;

    span {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    &.deleting {
      color: #ffc0b8;
      border-color: rgba(200, 70, 60, 0.55);
    }
  }
}

.dw-phrases-section {
  margin-bottom: 0;
}

.dw-phrase-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  button {
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 7px;
    padding: 7px 9px;
    color: #dfd5bd;
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;

    &:hover {
      border-color: rgba(187, 145, 65, 0.6);
    }
  }
}

.dw-phrase-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  line-height: 1.9;

  button {
    border: 1px solid rgba(187, 145, 65, 0.45);
    border-radius: 6px;
    padding: 2px 7px;
    color: #e6d2a4;
    background: transparent;
    cursor: pointer;

    &.active {
      box-shadow: 0 0 0 2px rgba(187, 145, 65, 0.35);
    }

    &.filled {
      color: #fff4d3;
      background: rgba(111, 84, 29, 0.38);
    }

    &.optional {
      border-style: dashed;
    }
  }
}

.dw-phrase-options {
  margin-top: 9px;
  max-height: 160px;
  overflow-y: auto;

  button {
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 5px 8px;
    color: #ddd;
    background: rgba(255, 255, 255, 0.045);
    cursor: pointer;

    &.selected {
      color: #fff3cf;
      border-color: #d4b36b;
      background: rgba(124, 90, 25, 0.56);
    }

    &.ghost {
      background: transparent;
    }
  }
}

.dw-phrase-actions {
  margin-top: 9px;

  span {
    margin-right: auto;
    color: #cfc3a7;
    overflow-wrap: anywhere;
  }
}

@media (max-width: 760px) {
  .dw-panel {
    width: 92vw;
    max-height: 84vh;
    padding: 2px 2px 9px;
  }

  .dw-head {
    padding-right: 38px;

    h3 {
      font-size: 20px;
    }
  }

  .dw-grid,
  .dw-phrase-list {
    grid-template-columns: 1fr;
  }

  .dw-history {
    max-height: 190px;
  }
}
</style>
