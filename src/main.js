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

new Vue({
  render: h => h(App),
  store
}).$mount("#app");
