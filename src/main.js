import Vue from "vue";
import App from "./App";
import store from "./store";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fas } from "@fortawesome/free-solid-svg-icons";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { wraith } from './assets/svg/wraith';

const faIcons = [
  "AddressCard",
  "ArrowCircleUp",  "ArrowCircleDown",
  "ArrowLeft",
  "Ban",
  "Bell",
  "PaperPlane",
  "Book",
  "BookOpen",
  "BookDead",
  "BroadcastTower",
  "Chair",
  "CheckSquare",
  "CloudMoon",
  "Cog",
  "Comment",
  "CommentDots",
  "Copy",
  "Clipboard",
  "Dice",
  "Dragon",
  "Eraser",
  "ExchangeAlt",
  "ExclamationTriangle",
  "Eye",
  "FileCode",
  "FileUpload",
  "Globe",
  "HandPaper",
  "HandPointRight",
  "HardHat",
  "HatWizard",
  "Hashtag",
  "Heartbeat",
  "Image",
  "Keyboard",
  "Link",
  "Minus",
  "MinusCircle",
  "Microphone",
  "MicrophoneSlash",
  "PeopleArrows",
  "Plus",
  "PlusCircle",
  "Question",
  "Random",
  "RedoAlt",
  "SearchMinus",
  "SearchPlus",
  "Search",
  "Spinner",
  "Star",
  "SlidersH",
  "Skull",
  "Slash",
  "Square",
  "TheaterMasks",
  "Times",
  "TimesCircle",
  "TrashAlt",
  "Undo",
  "User",
  "UserEdit",
  "UserFriends",
  "UserTie",
  "Users",
  "VenusMars",
  "VolumeUp",
  "VolumeMute",
  "VoteYea",
  "WindowMaximize",
  "WindowMinimize"
];
const fabIcons = ["Github", "Discord"];
library.add(
  ...faIcons.map(i => fas["fa" + i]),
  ...fabIcons.map(i => fab["fa" + i]),
  wraith
);
Vue.component("font-awesome-icon", FontAwesomeIcon);
Vue.config.productionTip = false;

// 把构建时注入的最后更新时间写入 store，供「关于 → 更新日志」下方的 build 按钮展示。
// build 版本号取该时间的紧凑格式（YYYYMMDD.HHmm），若未注入则回退空串。
if (typeof __BUILD_TIME__ !== "undefined" && __BUILD_TIME__) {
  const d = new Date(__BUILD_TIME__);
  if (!isNaN(d.getTime())) {
    const pad = n => String(n).padStart(2, "0");
    const buildVersion =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.` +
      `${pad(d.getHours())}${pad(d.getMinutes())}`;
    store.commit("setBuildVersion", buildVersion);
  }
}

new Vue({
  render: h => h(App),
  store
}).$mount("#app");
