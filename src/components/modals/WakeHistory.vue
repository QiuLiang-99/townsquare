<template>
  <section class="wake-history-section">
    <h4>交流记录</h4>
    <div class="wake-history" ref="history" aria-live="polite">
      <p v-if="!entries.length" class="empty">还没有消息记录。</p>
      <article
        v-for="entry in entries"
        :key="entry.key"
        :class="{ reply: entry.isReply }"
      >
        <div class="meta">
          <span>{{ entry.phase && entry.phase.label }}</span>
          <span>{{ formatTime(entry.createdAt) }}</span>
          <b>{{ entry.sender }}</b>
          <span v-if="entry.status">{{ statusLabel(entry.status) }}</span>
        </div>
        <p>{{ entry.content }}</p>
        <small v-if="entry.error">{{ entry.error }}</small>
      </article>
    </div>
  </section>
</template>
<script>
export default {
  props: { messages: { type: Array, default: () => [] } },
  computed: {
    entries() {
      const entries = [];
      this.messages.forEach((message) => {
        entries.push({
          key: message.id,
          phase: message.phase,
          createdAt: message.createdAt,
          sender: `说书人 · ${message.senderName || "说书人"}`,
          content: message.content,
          status: message.status,
          error: message.error,
        });
        if (message.reply)
          entries.push({
            key: `${message.id}:reply:${message.reply.id}`,
            isReply: true,
            phase: message.reply.phase || message.phase,
            createdAt: message.reply.createdAt,
            sender: `玩家 · ${
              message.reply.senderName || message.targetName || "玩家"
            }`,
            content: message.reply.content,
            status: message.replyStatus || "replied",
          });
      });
      return entries.sort(
        (a, b) =>
          (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
      );
    },
  },
  watch: {
    entries: {
      deep: true,
      handler() {
        this.$nextTick(this.scrollBottom);
      },
    },
  },
  mounted() {
    this.scrollBottom();
  },
  methods: {
    scrollBottom() {
      const box = this.$refs.history;
      if (box) box.scrollTop = box.scrollHeight;
    },
    formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          });
    },
    statusLabel(status) {
      return (
        {
          sending: "发送中",
          accepted: "服务端已接受，待玩家确认",
          delivered: "已送达",
          replied: "已回复",
          failed: "发送失败",
        }[status] || ""
      );
    },
  },
};
</script>
<style scoped lang="scss">
.wake-history-section {
  margin: 10px 0 14px;
  h4 {
    margin: 0 0 8px;
    color: #e1c17b;
  }
}
.wake-history {
  height: 200px;
  max-height: 28vh;
  min-height: 90px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 9px;
  border: 1px solid rgba(187, 145, 65, 0.35);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.3);
  article {
    padding: 8px 10px;
    margin-bottom: 7px;
    border-radius: 7px;
    background: rgba(137, 105, 45, 0.14);
  }
  article.reply {
    background: rgba(50, 100, 70, 0.16);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 12px;
    color: #baa77c;
    font-size: 12px;
  }
  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 6px 0;
    line-height: 1.5;
  }
  small {
    color: #ffb2a8;
  }
  .empty {
    color: #999;
    text-align: center;
  }
}
</style>
