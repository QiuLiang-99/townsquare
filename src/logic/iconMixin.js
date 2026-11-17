// 让「角色图标」相关组件在图床直链加载失败后自动重渲染。
//
// roleIcon.js 用 new Image() 预加载图床直链，失败时把该 URL 标记为 bad 并通知订阅者。
// 任何渲染角色图标的组件混入本 mixin 后，状态一变就会重新渲染，
// 从而立刻从「图床直链」切换到 JSON 里的 image（或内置图标）兜底。
import { subscribeIconStatus } from "./roleIcon";

export default {
  data() {
    return { iconStatusRev: 0 };
  },
  created() {
    this.__iconStatusUnsub = subscribeIconStatus(() => {
      this.iconStatusRev++;
    });
  },
  beforeDestroy() {
    if (this.__iconStatusUnsub) {
      this.__iconStatusUnsub();
      this.__iconStatusUnsub = null;
    }
  }
};
