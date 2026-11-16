import Vue from "vue";
import Vuex from "vuex";
import persistence from "./persistence";
import quickWakePersistence from "./quickWakePersistence";
import socket from "./socket";
import players from "./modules/players";
import session from "./modules/session";
import lobby from "./modules/lobby";
import quickWake from "./modules/quickWake";
import editionJSON from "../editions.json";
import rolesJSON from "../roles.json";
import fabledJSON from "../fabled.json";
import jinxesJSON from "../hatred.json";
import { identityReminders } from "../logic/reminders";

Vue.use(Vuex);

// helper functions
const getRolesByEdition = (edition = editionJSON[0]) => {
  if (edition.id === 'all') {
    return new Map(
      rolesJSON
        .sort((a, b) => b.team.localeCompare(a.team))
        .map(role => [role.id, role])
    );
  }
  return new Map(
    rolesJSON
      .filter(r => r.edition === edition.id || edition.roles.includes(r.id))
      .sort((a, b) => b.team.localeCompare(a.team))
      .map(role => [role.id, role])
  );
};

const getTravelersNotInEdition = (edition = editionJSON[0]) => {
  return new Map(
    rolesJSON
      .filter(
        r =>
          r.team === "traveler" &&
          r.edition !== edition.id &&
          !edition.roles.includes(r.id)
      )
      .map(role => [role.id, role])
  );
};

const set = key => ({ grimoire }, val) => {
  grimoire[key] = val;
};

const toggle = key => ({ grimoire }, val) => {
  if (val === true || val === false) {
    grimoire[key] = val;
  } else {
    grimoire[key] = !grimoire[key];
  }
};

const clean = id => id.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

// global data maps
const editionJSONbyId = new Map(
  editionJSON.map(edition => [edition.id, edition])
);
const rolesJSONbyId = new Map(rolesJSON.map(role => [role.id, role]));
const fabled = new Map(fabledJSON.map(role => [role.id, role]));

// jinxes
let jinxes = {};
try {
  // Note: can't fetch live list due to lack of CORS headers
  // fetch("https://bloodontheclocktower.com/script/data/hatred.json")
  //   .then(res => res.json())
  //   .then(jinxesJSON => {
  jinxes = new Map(
    jinxesJSON.map(({ id, hatred }) => [
      clean(id),
      new Map(hatred.map(({ id, reason }) => [clean(id), reason]))
    ])
  );
  // });
} catch (e) {
  console.error("couldn't load jinxes", e);
}

// base definition for custom roles
const customRole = {
  id: "",
  name: "",
  image: "",
  ability: "",
  edition: "custom",
  firstNight: 0,
  firstNightReminder: "",
  otherNight: 0,
  otherNightReminder: "",
  reminders: [],
  remindersGlobal: [],
  jinxes: [],
  setup: false,
  team: "townsfolk",
  isCustom: true
};

export default new Vuex.Store({
  modules: {
    players,
    session,
    lobby,
    quickWake
  },
  state: {
    version: "3.4.0",
    buildVersion: "",
    latestVersion: "",
    lastVersion: "",
    floatingNotice: "",
    grimoire: {
      isNight: false,
      isNightOrder: true,
      isPublic: false,
      isMenuOpen: false,
      isStatic: false,
      isMuted: false,
      isImageOptIn: true,
      isForwardEvilInfo: false,
      zoom: 0,
      background: "",
      audioThreshold: 150,
      // 夜间唤醒助手：当前第几夜（1 = 首夜）。持久化到 localStorage，刷新不丢。
      night: 1
    },
    modals: {
      version: false,
      edition: false,
      fabled: false,
      gameState: false,
      nightOrder: false,
      nightWake: false,
      reference: false,
      reminder: false,
      role: false,
      roles: false,
      draw: false,
      blindDraw: false,
      scriptLibrary: false,
      voteHistory: false,
      input: false,
      groupChat: false,
      quick: false,
      directedWake: false,
      playerWake: false
    },
    edition: editionJSONbyId.get("tb"),
    selectedEditions: {
      tb: true,
      bmr: true,
      snv: true,
      exp: true,
      hdcs: true,
      syyl: true
    },
    roles: getRolesByEdition(),
    otherTravelers: getTravelersNotInEdition(),
    fabled,
    jinxes,
    states: [],
    teamsNames: {
      townsfolk: "镇民",
      outsider: "外来者",
      minion: "爪牙",
      demon: "恶魔"
    },
    firstNight: [],
    otherNight: []
  },
  getters: {
    /**
     * 全部剧本的 id -> { id, name } 映射，供大厅展示房间剧本名。
     */
    editionsList: () => Array.from(editionJSONbyId.values()).map(e => ({ id: e.id, name: e.name })),
    /**
     * Return all custom roles, with default values and non-essential data stripped.
     * Role object keys will be replaced with a numerical index to conserve bandwidth.
     * @param roles
     * @returns {[]}
     */
    customRolesStripped: ({ roles }) => {
      const customRoles = [];
      const customKeys = Object.keys(customRole);
      const strippedProps = [
        "firstNightReminder",
        "otherNightReminder",
        "isCustom"
      ];
      roles.forEach(role => {
        if (!role.isCustom) {
          customRoles.push({ id: role.id });
        } else {
          const strippedRole = {};
          for (let prop in role) {
            if (strippedProps.includes(prop)) {
              continue;
            }
            const value = role[prop];
            if (customKeys.includes(prop) && value !== customRole[prop]) {
              strippedRole[customKeys.indexOf(prop)] = value;
            }
          }
          customRoles.push(strippedRole);
        }
      });
      return customRoles;
    },
    rolesJSONbyId: () => rolesJSONbyId
  },
  mutations: {
    setZoom: set("zoom"),
    setBackground: set("background"),
    setLatestVersion(state, val) {
      state.latestVersion = val;
    },
    setLastVersion(state, val) {
      state.lastVersion = val;
    },
    setBuildVersion(state, val) {
      state.buildVersion = val;
    },
    setFloatingNotice(state, val) {
      state.floatingNotice = val;
    },
    setAudioThreshold: set("audioThreshold"),
    toggleMuted: toggle("isMuted"),
    toggleMenu: toggle("isMenuOpen"),
    toggleNightOrder: toggle("isNightOrder"),
    toggleStatic: toggle("isStatic"),
    toggleNight: toggle("isNight"),
    // 夜间唤醒助手的夜次：只接受 >=1 的整数
    setNight({ grimoire }, val) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 1) grimoire.night = n;
    },
    // 新开一局：夜次回默认第 1 夜
    setDefaultNight({ grimoire }) {
      grimoire.night = 1;
    },
    toggleGrimoire: toggle("isPublic"),
    toggleImageOptIn: toggle("isImageOptIn"),
    toggleForwardEvilInfo:toggle("isForwardEvilInfo"),
    toggleModal({ modals }, name) {
      if (this.getters["quickWake/pendingCount"] > 0) {
        // Only allow opening the required dialog; never allow toggling it off
        // or replacing it via the global close/shortcut paths.
        if (name !== "playerWake" || modals.playerWake) return;
      }
      if (modals.input) this.state.session.isTyping = false;
      if (name) {
        modals[name] = !modals[name];
      }
      for (let modal in modals) {
        if (modal === name) continue;
        modals[modal] = false;
      }
    },
    /**
     * Store custom roles
     * @param state
     * @param roles Array of role IDs or full role definitions
     */
    setCustomRoles(state, roles) {
      const oldRoles = Object.keys(state.session.isUseOldRole).filter(key => state.session.isUseOldRole[key] === true);
      roles = roles.map(role => {
        return oldRoles.includes(role.id) ? {...role, id: role.id + 'old1'} : role; // use role if not ticked, add old1 if ticked
      })
      const processedRoles = roles
        // replace numerical role object keys with matching key names
        .map(role => {
          if (role[0]) {
            const customKeys = Object.keys(customRole);
            const mappedRole = {};
            for (let prop in role) {
              if (customKeys[prop]) {
                mappedRole[customKeys[prop]] = role[prop];
              }
            }
            return mappedRole;
          } else {
            return role;
          }
        })
        // clean up role.id
        .map(role => {
          role.id = clean(role.id);
          return role;
        })
        // map existing roles to base definition or pre-populate custom roles to ensure all properties
        .map(
          role =>
            rolesJSONbyId.get(role.id) ||
            state.roles.get(role.id) ||
            Object.assign({}, customRole, role)
        )
        // default empty icons and placeholders, clean up firstNight / otherNight
        .map(role => {
          if (rolesJSONbyId.get(role.id)) return role;
          role.imageAlt = // map team to generic icon
            {
              townsfolk: "good",
              outsider: "outsider",
              minion: "minion",
              demon: "evil",
              fabled: /^bootlegger\d+$/.test(role.id) ? "bootlegger" : "fabled", // 直接使用私货商人图标
              loric: /^bootlegger\d+$/.test(role.id) ? "bootlegger" : "loric"
            }[role.team] || "custom";
          role.firstNight = Math.abs(role.firstNight);
          role.otherNight = Math.abs(role.otherNight);
          return role;
        })
        // filter out roles that don't match an existing role and also don't have name/ability/team
        .filter(role => role.name && role.ability && role.team)
        // sort by team
        .sort((a, b) => b.team.localeCompare(a.team));
      // convert to Map without Fabled
      state.roles = new Map(
        processedRoles
          .filter(role => role.team !== "fabled" && role.team !== "loric")
          .map(role => {
            if (role.team === "traveller") role.team = "traveler";
            return role;
          })
          .map(role => [role.id, role])
      );
      // update Fabled to include custom Fabled from this script
      state.fabled = new Map([
        ...processedRoles.filter(r => r.team === "fabled" || r.team === "loric").map(r => [r.id, r]),
        ...fabledJSON.map(role => [role.id, role])
      ]);
      // update extraTravelers map to only show travelers not in this script
      state.otherTravelers = new Map(
        rolesJSON
          .filter(r => r.team === "traveler" && !roles.some(i => i.id === r.id))
          .map(role => [role.id, role])
      );
    },
    setSelectedEditions(state, selectedEditions){
      state.selectedEditions = {...selectedEditions};
      if (state.edition.id === "all") this.commit("setEdition", state.edition);
    },
    setStates(state, states){
      state.states = states;
    },
    setTeamsNames(state, names) {
      state.teamsNames = names;
    },
    setFirstNight(state, firstNight) {
      state.firstNight = firstNight;
      this.commit("players/setFirstNight", firstNight);
    },
    setOtherNight(state, otherNight) {
      state.otherNight = otherNight;
      this.commit("players/setOtherNight", otherNight);
    },
    setEdition(state, edition) {
      if (editionJSONbyId.has(edition.id)) {
        state.edition = editionJSONbyId.get(edition.id);
        state.roles = getRolesByEdition(state.edition);
        if (state.edition.id === 'all') { //只加载勾选了的剧本
          state.roles = new Map(
            Array.from(state.roles.entries()).filter((role) => {
              const value = role[1]; //value of the role
              return state.selectedEditions[value.edition];
            })
          )
        }
        state.otherTravelers = getTravelersNotInEdition(state.edition);
        const fabled = Array.from(state.fabled.values()).filter((role) => {
          return role.edition === edition.id;
        });
        if (!state.session.isSpectator) this.commit("players/setFabled", {fabled});
      } else {
        state.edition = edition;
      }
      // 为官方角色增加原顺序选项
      if (state.roles.get('professor')) {
        state.roles.get('professor').otherNight = state.session.isUseOldOrder.professor ? 79 : 96;
      }
      if (state.roles.get('pithag')) {
        state.roles.get('pithag').otherNight = state.session.isUseOldOrder.pithag ? 37 : 16;
      }
      state.modals.edition = false;
    }
  },
  actions: {
    /**
     * 新开一局：把「只属于当前这一局」的临时状态全部复位。
     * 适用场景：换剧本、随机分配角色、抽取角色（线下发牌）。
     *
     * 复位内容：
     *  - 每个玩家的角色、生死状态(isDead)、提示标记(reminders，认知覆盖角色自动挂回真实身份标记)、
     *    夜间唤醒助手的完成标记(nightDone)、本座位投票(votes)
     *  - 本局临时存储：投票(nomination/votes/lockedVote/isVoteInProgress)、
     *    投票历史(voteHistory/voteSelected)、抽牌队列(drawRoles)、复盘状态(isReview)
     *  - 夜次(grimoire.night)回到第 1 夜
     *
     * @param {Object} payload
     * @param {Map}    payload.roleMap 当前剧本的角色 Map（store.state.roles），用于还原认知覆盖标记。
     *                                 不传则用当前 store.state.roles。
     * @param {Function} [payload.pickRole] 可选：(player) => 新角色对象。用于「随机分配/抽取」时
     *                                 直接给每个座位写入新角色（传 null 表示保留现有角色，只清状态）。
     */
    newGame({ state, commit }, { roleMap, pickRole = null } = {}) {
      const roles = roleMap || state.roles;
      const session = state.session;

      // 1) 逐座位复位角色 / 生死 / 提示标记 / 夜间完成标记 / 投票
      state.players.players.forEach((player, index) => {
        if (player.role && player.role.team === "traveler") {
          // 旅行者不参与发牌，跳过角色改动，但也清掉上一局的死亡/标记/完成态
          commit("players/update", { player, property: "isDead", value: false });
          commit("players/update", { player, property: "reminders", value: [] });
          commit("players/update", { player, property: "nightDone", value: {} });
          return;
        }
        let role = player.role;
        if (typeof pickRole === "function") {
          role = pickRole(player, index);
          commit("players/update", { player, property: "role", value: role });
        }
        commit("players/update", { player, property: "isDead", value: false });
        commit("players/update", {
          player,
          property: "reminders",
          value: identityReminders(role, roles)
        });
        commit("players/update", { player, property: "nightDone", value: {} });
        commit("players/update", { player, property: "votes", value: 1 });
      });

      // 2) 本局临时存储复位
      commit("session/nomination", {}); // 清空提名/票型/锁票/进行中
      commit("session/clearVoteHistory");
      commit("session/setDrawRoles", []);
      commit("session/stopTimer");
      if (session.isReview) commit("session/setIsReview", false);

      // 3) 夜次回到第一夜（夜间唤醒助手）
      commit("setDefaultNight");
    },
    async fetchInit() {
      try {
        // 自建后端：默认同源 /dynamic/init；可用 window.__TS_API__ 覆盖主机
        const apiBase = window.__TS_API__ || window.location.origin;
        const response = await fetch(apiBase + '/dynamic/init');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const message = await response.text();
        const payload = JSON.parse(message).payload;
        if (!!payload && typeof payload === 'object') {
          const propertyList = ['version', 'floatingNotice'];
          const mutationMapping = {
            'version': 'setLatestVersion',
            'floatingNotice': 'setFloatingNotice'
          }
          for (const property of propertyList) {
            if (payload[property]) this.commit(mutationMapping[property], payload[property]);
          }
        }
        if (this.state.version != this.state.latestVersion || this.state.latestVersion != this.state.lastVersion) this.commit("toggleModal", "version");
      } catch (e) {
        return null;
      }
    }
  },
  plugins: [persistence, quickWakePersistence, socket]
});
