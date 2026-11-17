<template>
  <Modal
    v-if="modals.playerWake"
    name="player-wake"
    :dismissible="!pending.length"
    @close="close"
  >
    <div class="pw-panel">
      <h3 v-if="!currentMessage">快捷唤醒记录</h3>
      <p class="pw-error" v-if="!quickWake.connected">
        连接已断开；未确认的回复会在重连后沿用原 ID 重试。
      </p>
      <p class="pw-error" v-else-if="!quickWake.hostOnline">
        说书人已离线。回复由房间保存，等待说书人重连查看。
      </p>
      <p class="pw-error" v-if="quickWake.storageError">
        {{ quickWake.storageError }}
      </p>
      <WakeHistory :messages="history" />
      <template v-if="currentMessage">
        <header class="pw-head">
          <div>
            <span class="pw-kicker"
              >{{ currentMessage.phase.label }} · 说书人找你</span
            >
            <h3>{{ currentMessage.senderName || "说书人" }}发来消息</h3>
          </div>
          <span class="pw-queue" v-if="pending.length > 1"
            >还有 {{ pending.length - 1 }} 条</span
          >
        </header>

        <div class="pw-message">
          <p>{{ currentMessage.content }}</p>
        </div>

        <div class="pw-reply-preview">
          <span>你的回复</span>
          <div v-if="replyFragments.length">
            <button
              v-for="(fragment, index) in replyFragments"
              :key="fragment.id"
              @click="replyFragments.splice(index, 1)"
            >
              {{ fragment.text }} <b>×</b>
            </button>
          </div>
          <em v-else>请选择下方一种回复</em>
        </div>

        <div class="pw-main-actions" v-if="stage === 'main'">
          <button
            v-for="word in quickReplies"
            :key="word"
            :class="{
              selected:
                replyFragments.length === 1 && replyFragments[0].text === word,
            }"
            @click="setSimpleReply(word)"
          >
            {{ word }}
          </button>
          <button @click="openSelector('players')">玩家</button>
          <button @click="openSelector('roles')">角色</button>
          <button @click="stage = 'custom'">自定义</button>
        </div>

        <div class="pw-picker" v-if="stage === 'players'">
          <div class="pw-picker-head">
            <b>按顺序选择玩家</b>
            <span>已选 {{ selectedPlayerIds.length }} 项</span>
          </div>
          <div class="pw-choice-list">
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
          <div class="pw-picker-actions">
            <button class="ghost" @click="stage = 'main'">返回</button>
            <button @click="confirmMulti('players')">完成</button>
          </div>
        </div>

        <div class="pw-picker" v-if="stage === 'roles'">
          <div class="pw-picker-head">
            <b>按顺序选择角色</b>
            <span>只显示当前剧本角色</span>
          </div>
          <div class="pw-choice-list roles">
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
          <div class="pw-picker-actions">
            <button class="ghost" @click="stage = 'main'">返回</button>
            <button @click="confirmMulti('roles')">完成</button>
          </div>
        </div>

        <form
          class="pw-custom"
          v-if="stage === 'custom'"
          @submit.prevent="confirmCustom"
        >
          <textarea
            v-model="customText"
            maxlength="1000"
            rows="3"
            placeholder="输入回复内容"
            ref="customInput"
            @focus="$store.commit('session/setTyping', true)"
            @blur="$store.commit('session/setTyping', false)"
          ></textarea>
          <div class="pw-picker-actions">
            <button type="button" class="ghost" @click="stage = 'main'">
              返回
            </button>
            <button type="submit" :disabled="!customText.trim()">完成</button>
          </div>
        </form>

        <p class="pw-error" v-if="quickWake.notice">{{ quickWake.notice }}</p>
        <p class="pw-error" v-if="quickWake.storageError">
          {{ quickWake.storageError }}
        </p>
        <p class="pw-error" v-if="session.isReconnecting">
          网络正在重连，回复会在恢复连接后使用原消息 ID 重试。
        </p>
        <div class="pw-submit">
          <span v-if="isSending">正在向说书人发送回复…</span>
          <span v-else>回复发送成功前不能关闭这条消息。</span>
          <button :disabled="!replyPreview || isSending" @click="submitReply">
            {{ isSending ? "发送中" : "确认发送回复" }}
          </button>
        </div>
      </template>
    </div>
  </Modal>
</template>

<script>
import { mapState } from "vuex";
import Modal from "./Modal";
import WakeHistory from "./WakeHistory";
import {
  composeText,
  createWakeReply,
  makeId,
  normalizeText,
  phaseSnapshot,
} from "../../logic/quickWake";

const ROLE_TEAMS = ["townsfolk", "outsider", "minion", "demon", "traveler"];

export default {
  name: "PlayerWakeModal",
  components: { Modal, WakeHistory },
  data() {
    return {
      stage: "main",
      replyFragments: [],
      selectedPlayerIds: [],
      selectedRoleIds: [],
      customText: "",
      quickReplies: ["了解", "是", "否"],
    };
  },
  computed: {
    ...mapState(["modals", "session", "roles", "quickWake", "grimoire"]),
    ...mapState("players", ["players"]),
    history() {
      return this.$store.getters["quickWake/currentMessages"].filter(
        (message) => message.targetPlayerId === this.session.playerId,
      );
    },
    pending() {
      return this.$store.getters["quickWake/pendingForMe"];
    },
    currentMessage() {
      return this.pending[0] || null;
    },
    replyPreview() {
      return composeText(this.replyFragments);
    },
    isSending() {
      return !!(
        this.currentMessage && this.currentMessage.replyStatus === "sending"
      );
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
  },
  watch: {
    pending: {
      handler(list) {
        if (list.length) {
          this.$store.commit("quickWake/setForceReply", true);
          if (!this.modals.playerWake) {
            this.$store.commit("toggleModal", "playerWake");
          }
        } else {
          this.$store.commit("quickWake/setForceReply", false);
          if (this.modals.playerWake) {
            this.$store.commit("toggleModal", "playerWake");
          }
          this.resetDraft();
        }
      },
      immediate: true,
      deep: true,
    },
    "modals.playerWake"(open) {
      if (!open) this.resetDraft();
    },
    "currentMessage.id"(id, previous) {
      if (id && id !== previous) this.resetDraft();
    },
    stage(stage) {
      if (stage === "custom") {
        this.$nextTick(
          () => this.$refs.customInput && this.$refs.customInput.focus(),
        );
      }
    },
  },
  mounted() {
    window.addEventListener("keydown", this.handleKeydown, true);
  },
  beforeDestroy() {
    window.removeEventListener("keydown", this.handleKeydown, true);
    this.$store.commit("session/setTyping", false);
  },
  methods: {
    handleKeydown(event) {
      if (!this.modals.playerWake || !this.pending.length) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (this.stage !== "main" && !this.isSending) this.stage = "main";
    },
    close() {
      if (this.pending.length) return;
      this.$store.commit("toggleModal", "playerWake");
    },
    resetDraft() {
      this.stage = "main";
      this.replyFragments = [];
      this.selectedPlayerIds = [];
      this.selectedRoleIds = [];
      this.customText = "";
      this.$store.commit("session/setTyping", false);
    },
    setSimpleReply(word) {
      this.replyFragments = [{ id: makeId("reply-fragment"), text: word }];
      this.stage = "main";
    },
    openSelector(type) {
      this.stage = type;
      this.selectedPlayerIds = [];
      this.selectedRoleIds = [];
    },
    toggleSelection(list, id) {
      const index = list.indexOf(id);
      if (index >= 0) list.splice(index, 1);
      else list.push(id);
    },
    confirmMulti(type) {
      const fragments = [];
      if (type === "players") {
        this.selectedPlayerIds.forEach((id) => {
          const player = this.selectablePlayers.find((item) => item.id === id);
          if (player)
            fragments.push({
              id: makeId("reply-fragment"),
              text: `${player.seat}号玩家 ${player.name}`,
            });
        });
      } else {
        this.selectedRoleIds.forEach((id) => {
          const role = this.selectableRoles.find((item) => item.id === id);
          if (role)
            fragments.push({ id: makeId("reply-fragment"), text: role.name });
        });
      }
      if (fragments.length) this.replyFragments = fragments;
      this.stage = "main";
    },
    confirmCustom() {
      const text = normalizeText(this.customText, 1000);
      if (!text) return;
      this.replyFragments = [{ id: makeId("reply-fragment"), text }];
      this.customText = "";
      this.stage = "main";
      this.$store.commit("session/setTyping", false);
    },
    submitReply() {
      if (!this.currentMessage || !this.replyPreview || this.isSending) return;
      this.$store.commit("quickWake/setNotice", "");
      try {
        const reply = createWakeReply({
          id: makeId("reply"),
          wakeId: this.currentMessage.id,
          roomId: this.session.sessionId,
          playerId: this.session.playerId,
          senderName: this.session.playerName,
          phase: phaseSnapshot(this.grimoire.isNight, this.grimoire.night),
          content: this.replyPreview,
        });
        this.$store.commit("quickWake/enqueueReply", reply);
      } catch (error) {
        this.$store.commit("quickWake/setNotice", error.message);
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

.pw-panel {
  width: min(620px, 90vw);
  max-height: 84vh;
  overflow-y: auto;
  padding: 5px 8px 14px;
  color: #f4ecd8;
}

.pw-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 5px 40px 12px 3px;

  h3 {
    margin: 5px 0 0;
    color: #d4b36b;
    font-size: 23px;
  }
}

.pw-kicker {
  color: #c4b48d;
  font-size: 13px;
}

.pw-queue {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 5px 10px;
  color: #ffdf9b;
  background: rgba(121, 84, 20, 0.5);
  font-size: 12px;
}

.pw-message {
  border: 1px solid rgba(187, 145, 65, 0.45);
  border-radius: 10px;
  padding: 16px;
  background: rgba(75, 56, 19, 0.28);

  p {
    margin: 0;
    color: #fff5d8;
    font-size: 20px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.pw-reply-preview {
  margin-top: 12px;

  > span {
    display: block;
    margin-bottom: 6px;
    color: #aaa;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    border: 1px solid rgba(121, 175, 114, 0.5);
    border-radius: 7px;
    padding: 5px 8px;
    color: #e0f7d9;
    background: rgba(55, 100, 50, 0.3);
    cursor: pointer;

    b {
      color: #ffaaa0;
      margin-left: 3px;
    }
  }

  em {
    color: #888;
    font-size: 13px;
    font-style: normal;
  }
}

.pw-main-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;

  button {
    border: 1px solid rgba(187, 145, 65, 0.45);
    border-radius: 8px;
    padding: 11px 8px;
    color: #f1e4c0;
    background: rgba(73, 58, 29, 0.65);
    cursor: pointer;
    font-size: 15px;

    &:hover,
    &.selected {
      border-color: #d4b36b;
      color: #fff7dd;
      background: rgba(120, 88, 28, 0.7);
    }
  }
}

.pw-picker,
.pw-custom {
  margin-top: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 12px;
}

.pw-picker-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: #ddd;
  font-size: 13px;

  span {
    color: #999;
  }
}

.pw-choice-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  max-height: 230px;
  overflow-y: auto;

  button {
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 7px;
    padding: 7px 8px;
    color: #ddd;
    text-align: left;
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;

    &.selected {
      border-color: #d4b36b;
      color: #fff3cf;
      background: rgba(124, 90, 25, 0.56);
    }

    span {
      float: right;
      color: #9ee495;
    }
  }
}

.pw-custom textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  font-family: inherit;
  font-size: 15px;
  resize: vertical;
}

.pw-picker-actions,
.pw-submit {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 9px;
  margin-top: 10px;

  button {
    border: 1px solid rgba(187, 145, 65, 0.55);
    border-radius: 7px;
    padding: 8px 13px;
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
}

.pw-error {
  margin: 10px 0 0;
  color: #ffb2a8;
  font-size: 13px;
}

.pw-submit {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 12px;

  span {
    margin-right: auto;
    color: #999;
    font-size: 12px;
  }

  button {
    padding: 10px 18px;
  }
}

@media (max-width: 560px) {
  .pw-panel {
    width: 90vw;
    max-height: 82vh;
  }

  .pw-head {
    padding-right: 35px;

    h3 {
      font-size: 20px;
    }
  }

  .pw-message p {
    font-size: 17px;
  }

  .pw-main-actions,
  .pw-choice-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
