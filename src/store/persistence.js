const { createSessionStorage } = require("./safeStorage");

module.exports = store => {
  if (window.location.pathname != "/") return;
  const localStorage = createSessionStorage(() => window.localStorage, () => {
    if (!store.state.quickWake.storageError) {
      store.commit("quickWake/setStorageError", "浏览器存储不可用，本次会话仍可继续使用快捷唤醒。");
    }
  });

  // 安全读取：遇到非法 JSON(如历史遗留的字符串 "undefined"/"null" 或损坏数据)
  // 不抛异常，自动清除该键并返回 fallback，避免初始化崩溃导致整页白屏。
  const safeParse = (key, fallback = undefined) => {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined || raw === "undefined" || raw === "null") {
      if (raw === "undefined" || raw === "null") localStorage.removeItem(key);
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      localStorage.removeItem(key);
      return fallback;
    }
  };
  // 安全写入：payload 为 undefined/null 时移除键，避免存入字符串 "undefined"
  const safeSetJSON = (key, value) => {
    if (value === undefined || value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const updatePagetitle = isPublic =>
    // (document.title = `Blood on the Clocktower ${
    //   isPublic ? "Town Square" : "Grimoire"
    // }`);
    (document.title = `编程分享：钟楼谜团魔典——线上的说书人辅助工具（血染钟楼） ${
      isPublic ? "" : ""
    }`);

  // initialize data
  if (localStorage.getItem("lastVersion")) {
    store.commit("setLastVersion", localStorage.getItem("lastVersion"));
  }
  if (localStorage.getItem("background")) {
    store.commit("setBackground", localStorage.background);
  }
  if (localStorage.getItem("muted")) {
    store.commit("toggleMuted", true);
  }
  if (localStorage.getItem("static")) {
    store.commit("toggleStatic", true);
  }
  if (localStorage.getItem("imageOptIn")) {
    store.commit("toggleImageOptIn", true);
  }
  if (localStorage.getItem("forceWikiIcon")) {
    store.commit("toggleForceWikiIcon", true);
    // 恢复后按需拉取图床索引，保证刷新后角色图标仍是 wiki 图
    store.dispatch("ensureWikiIcons");
  }
  if (localStorage.getItem("zoom")) {
    store.commit("setZoom", parseFloat(localStorage.getItem("zoom")));
  }
  if (localStorage.getItem("audioThreshold")) {
    store.commit("setAudioThreshold", localStorage.getItem("audioThreshold"));
  }
  if (localStorage.getItem("night")) {
    store.commit("setNight", parseInt(localStorage.getItem("night"), 10));
  }
  if (localStorage.getItem("isGrimoire")) {
    store.commit("toggleGrimoire", false);
    updatePagetitle(false);
  }
  {
    const v = safeParse("useOldOrder");
    if (v) store.commit("session/setUseOldOrder", v);
  }
  {
    const v = safeParse("useOldRole");
    if (v) store.commit("session/setUseOldRole", v);
  }
  {
    const v = safeParse("isReview");
    if (v !== undefined && v !== null) store.commit("session/setIsReview", v);
  }
  {
    const v = safeParse("selectedEditions");
    if (v) store.commit("setSelectedEditions", v);
  }
  {
    const v = safeParse("roles");
    if (v !== undefined && v !== null) {
      store.commit("setCustomRoles", v);
      store.commit("setEdition", { id: "custom" });
    }
  }
  {
    const v = safeParse("states");
    if (v) store.commit("setStates", v);
  }
  {
    const v = safeParse("teamsNames");
    if (v) store.commit("setTeamsNames", v)
  }
  {
    const v = safeParse("firstNight");
    if (v) store.commit("setFirstNight", v)
  }
  {
    const v = safeParse("otherNight");
    if (v) store.commit("setOtherNight", v)
  }
  {
    const v = safeParse("edition");
    if (v !== undefined && v !== null) {
      // this will initialize state.roles for official editions
      store.commit("setEdition", v);
    }
  }
  {
    const v = safeParse("bluffs");
    if (Array.isArray(v)) {
      v.forEach((role, index) => {
        store.commit("players/setBluff", {
          index,
          role: store.state.roles.get(role) || {}
        });
      });
    }
  }
  if (localStorage.getItem("playerProfileImage")) {
    localStorage.setItem("playerAvatar", localStorage.getItem("playerProfileImage"));
    localStorage.removeItem("playerProfileImage");
  }
  {
    const v = safeParse("fabled");
    if (Array.isArray(v)) {
      store.commit("players/setFabled", {
        fabled: v,
        emptyFabled: true
      });
    }
  }
  {
    const v = safeParse("stTokens");
    if (Array.isArray(v)) {
      store.commit("players/setStTokens", v);
    }
  }
  {
    const v = safeParse("players");
    if (Array.isArray(v)) {
      store.commit(
        "players/set",
        v.map(player => ({
          ...player,
          role:
            store.state.roles.get(player.role) ||
            store.getters.rolesJSONbyId.get(player.role) ||
            {}
        }))
      );
    }
  }
  /**** Session related data *****/
  if (localStorage.getItem("playerId")) {
    store.commit("session/setPlayerId", localStorage.getItem("playerId"));
  }
  if (localStorage.getItem("stSecret")) {
    store.commit("session/setStSecret", localStorage.getItem("stSecret"));
  }
  if (localStorage.getItem("playerName")) {
    store.commit("session/setPlayerName", localStorage.getItem("playerName"));
  }
  if (localStorage.getItem("stId")) {
    store.commit("session/setStId", localStorage.getItem("stId"));
  }
  if (localStorage.getItem("claimedSeat")) {
    store.commit("session/claimSeat", Number(localStorage.getItem("claimedSeat")));
  }
  if (localStorage.getItem("session")) {
    const [spectator, sessionId] = JSON.parse(localStorage.getItem("session"));
    store.commit("session/setSpectator", spectator);
    store.commit("session/setSessionId", sessionId);
  }
  if (localStorage.getItem("playerVotes")) {
    store.commit("session/setPlayerVotes", JSON.parse(localStorage.getItem("playerVotes")));
  }
  {
    const votes = safeParse("votes");
    if (Array.isArray(votes)) {
      votes.forEach(voteHistory => {
        store.commit("session/addVotes", voteHistory);
      })
    }
  }
  {
    const votesSelected = safeParse("votesSelected");
    if (Array.isArray(votesSelected)) {
      votesSelected.forEach(voteSelected => {
        store.commit("session/addVoteSelected", voteSelected);
      })
    }
  }
  {
    const customBootlegger = safeParse("customBootlegger");
    if (customBootlegger !== undefined && customBootlegger !== null) {
      store.commit("session/setBootlegger", customBootlegger);
    }
  }
  {
    const chatHistory = safeParse("chatHistory");
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach(player => {
        store.commit("session/createChatHistory", player.id);
        player.chat.forEach(message => {
          store.commit("session/updateChatReceived", {message, playerId: player.id});
        })
      })
    }
  }
  {
    const groupChats = safeParse("groupChats");
    if (Array.isArray(groupChats)) {
      groupChats.forEach(group => {
        store.commit("session/addGroupChat", {
          chatId: group.id,
          playerIds: group.playerIds,
          keep: group.keep
        });
      });
    }
  }
  if (localStorage.getItem("playerAvatar")) {
    store.commit("session/updatePlayerAvatar", localStorage.getItem("playerAvatar"));
  }
  {
    const v = safeParse("secretVote");
    if (v !== undefined && v !== null) store.commit("session/setSecretVote", v);
  }
  {
    const isRole = safeParse("isRole");
    if (isRole && typeof isRole === "object") {
      const role = Object.keys(isRole)[0];
      if (role && isRole[role] && typeof isRole[role] === "object") {
        for(const property in isRole[role]) {
          store.commit("session/setIsRole", {
            role,
            property,
            value: isRole[role][property],
            st: true
          });
        }
      }
    }
  }
  // listen to mutations
  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case "toggleGrimoire":
        if (!state.grimoire.isPublic) {
          localStorage.setItem("isGrimoire", 1);
        } else {
          localStorage.removeItem("isGrimoire");
        }
        updatePagetitle(state.grimoire.isPublic);
        break;
      case "setLastVersion":
        if (payload) {
          localStorage.setItem("lastVersion", payload);
        } else {
          localStorage.removeItem("lastVersion");
        }
        break;
      case "setBackground":
        if (payload) {
          localStorage.setItem("background", payload);
        } else {
          localStorage.removeItem("background");
        }
        break;
      case "toggleMuted":
        if (state.grimoire.isMuted) {
          localStorage.setItem("muted", 1);
        } else {
          localStorage.removeItem("muted");
        }
        break;
      case "toggleStatic":
        if (state.grimoire.isStatic) {
          localStorage.setItem("static", 1);
        } else {
          localStorage.removeItem("static");
        }
        break;
      case "toggleImageOptIn":
        if (state.grimoire.isImageOptIn) {
          localStorage.setItem("imageOptIn", 1);
        } else {
          localStorage.removeItem("imageOptIn");
        }
        break;
      case "toggleForceWikiIcon":
        if (state.grimoire.forceWikiIcon) {
          localStorage.setItem("forceWikiIcon", 1);
        } else {
          localStorage.removeItem("forceWikiIcon");
        }
        break;
      case "setZoom":
        if (payload !== 0) {
          localStorage.setItem("zoom", payload);
        } else {
          localStorage.removeItem("zoom");
        }
        break;
      case "setAudioThreshold":
        localStorage.setItem("audioThreshold", payload);
        break;
      case "setNight":
      case "setDefaultNight":
        localStorage.setItem("night", String(state.grimoire.night));
        break;
      case "setSelectedEditions":
        localStorage.setItem("selectedEditions", JSON.stringify(payload));
        break;
      case "setEdition":
        localStorage.setItem("edition", JSON.stringify(payload));
        if (state.edition.isOfficial) {
          localStorage.removeItem("roles");
        }
        break;
      case "setCustomRoles":
        if (!payload.length) {
          localStorage.removeItem("roles");
        } else {
          localStorage.setItem("roles", JSON.stringify(payload));
        }
        break;
      case "setStates":
        localStorage.setItem("states", JSON.stringify(payload));
        break;
      case "setTeamsNames":
        localStorage.setItem("teamsNames", JSON.stringify(payload));
        break;
      case "setFirstNight":
        localStorage.setItem("firstNight", JSON.stringify(payload));
        break;
      case "setOtherNight":
        localStorage.setItem("otherNight", JSON.stringify(payload));
        break;
      case "players/setBluff":
      case "players/updateBluff":
        localStorage.setItem(
          "bluffs",
          JSON.stringify(state.players.bluffs.map(({ id }) => id))
        );
        break;
      case "players/setFabled":
        localStorage.setItem(
          "fabled",
          JSON.stringify(state.players.fabled)
        );
        break;
      case "players/addStToken":
      case "players/removeStToken":
      case "players/setStTokens":
        safeSetJSON("stTokens", state.players.stTokens);
        break;
      case "players/add":
      case "players/update":
      case "players/remove":
      case "players/clear":
      case "players/set":
      case "players/swap":
      case "players/move":
        if (state.players.players.length) {
          localStorage.setItem(
            "players",
            JSON.stringify(
              state.players.players.map(player => ({
                ...player,
                // simplify the stored data
                role: player.role.id || {}
              }))
            )
          );
        } else {
          localStorage.removeItem("players");
        }
        break;
      case "session/setSessionId":
        if (payload) {
          localStorage.setItem(
            "session",
            JSON.stringify([state.session.isSpectator, payload])
          );
        } else {
          localStorage.removeItem("session");
        }
        break;
      case "session/setPlayerId":
        if (payload) {
          localStorage.setItem("playerId", payload);
        } else {
          localStorage.removeItem("playerId");
        }
        break;
      case "session/setStSecret":
        if (payload) {
          localStorage.setItem("stSecret", payload);
        } else {
          localStorage.removeItem("stSecret");
        }
        break;
      case "session/setPlayerName":
        if (payload) {
          localStorage.setItem("playerName", payload);
        } else {
          localStorage.removeItem("playerName");
        }
        break;
      case "session/setStId":
        if (payload) localStorage.setItem("stId", payload);
        else localStorage.removeItem("stId");
        break;
      case "session/claimSeat":
        if (payload >= 0) {
          localStorage.setItem("claimedSeat", payload);
        } else {
          localStorage.removeItem("claimedSeat");
        }
        break;
      case "session/setPlayerVotes":
        safeSetJSON("playerVotes", payload);
        break;
      case "session/addVotes": {
        if (payload.save) {
          const votes = localStorage.getItem("votes") ? JSON.parse(localStorage.getItem("votes")) : [];
          payload.save = false;
          votes.push(payload);
          localStorage.setItem("votes", JSON.stringify(votes));
        }
        break;
      }
      case "session/addVoteSelected": {
        if (payload.save) {
          const votesSelected = localStorage.getItem("votesSelected") ? JSON.parse(localStorage.getItem("votesSelected")) : [];
          payload.save = false;
          delete payload.players; // players added for conditioning in session
          votesSelected.push(payload);
          localStorage.setItem("votesSelected", JSON.stringify(votesSelected));
        }
        break;
      }
      case "session/clearVoteHistory": {
        if (!localStorage.getItem("votes")) break;
        if (!localStorage.getItem("votesSelected")) break;
        if (!payload || payload.length === 0) {
          localStorage.removeItem("votes");
          localStorage.removeItem("votesSelected");
        } else {
          const votes = JSON.parse(localStorage.getItem("votes"));
          const votesSelected = JSON.parse(localStorage.getItem("votesSelected"))
          const newVotes = votes.filter((_, index) => !payload.includes(index));
          const newVotesSelected = votesSelected.filter((_, index) => !payload.includes(index));
          localStorage.setItem("votes", JSON.stringify(newVotes));
          localStorage.setItem("votesSelected", JSON.stringify(newVotesSelected));
        }
        break;
      }
      case "session/setBootlegger":
        safeSetJSON("customBootlegger", payload);
        break;
      case "session/createChatHistory":
      case "session/updateChatSent":
      case "session/updateChatReceived":
        if (state.session.chatHistory) {
          localStorage.setItem("chatHistory", JSON.stringify(state.session.chatHistory));
        } else {
          localStorage.removeItem("chatHistory");
        }
        break;
      case "session/addGroupChat":
        {
          if (!!payload.playerIds && !payload.players) return;
          const chatId = payload.chatId;
          const playerIds = payload.players.map(player => player.id);
          const groupChats = localStorage.groupChats != undefined ? JSON.parse(localStorage.getItem("groupChats")) : [];
          const chats = groupChats.map(group => group.id);
          if (chats.includes(chatId)) {
            const group = groupChats.filter(group => group.id === chatId)[0];
            playerIds.forEach(id => {
              if (group.playerIds.includes(id)) return;
              group.playerIds.push(id);
            });
          } else {
            groupChats.push({
              id: chatId,
              playerIds,
              keep: false
            });
          }
          localStorage.setItem("groupChats", JSON.stringify(groupChats));
        }
        break;
      case "session/removeGroupChat":
        if (localStorage.groupChats != undefined) {
          const groupChats = JSON.parse(localStorage.getItem("groupChats"));
          const newGroupChats = groupChats.filter(group => group.id != payload.chatId);
          localStorage.setItem("groupChats", JSON.stringify(newGroupChats));
        }
        break;
      case "session/removeGroupChatMember":
        if (!!payload.playerIds && !payload.players) return;
        if (localStorage.groupChats != undefined) {
          const groupChats = JSON.parse(localStorage.getItem("groupChats"));
          const chatId = payload.chatId;
          const playerId = payload.player.id;
          const index = groupChats.findIndex(group => group.id === chatId);
          if (index === -1) return;
          
          groupChats[index].playerIds = groupChats[index].playerIds.filter(player => player != playerId);
          localStorage.setItem("groupChats", JSON.stringify(groupChats));
        }
        break;
      case "session/toggleGroupKeep":
        if (localStorage.groupChats != undefined) {
          const groupChats = JSON.parse(localStorage.getItem("groupChats"));
          const index = groupChats.findIndex(group => group.id === payload);
          if (index === -1) return;
          
          groupChats[index].keep = !groupChats[index].keep;
          localStorage.setItem("groupChats", JSON.stringify(groupChats));
        }
        break;
      case "session/updatePlayerAvatar":
        if (payload) localStorage.setItem("playerAvatar", payload);
        else localStorage.setItem("playerAvatar", "default.webp");
        break;
      case "session/setSecretVote":
        safeSetJSON("secretVote", payload);
        break;
      case "session/setUseOldOrder":
        if (payload) localStorage.setItem("useOldOrder", JSON.stringify(payload));
        break;
      case "session/setUseOldRole":
        if (payload) localStorage.setItem("useOldRole", JSON.stringify(payload));
        break;
      case "session/setIsReview":
        safeSetJSON("isReview", payload);
        break;
      case "session/setIsRole":
        {
          const role = payload.role;
          const property = payload.property;
          const value = payload.value;
          const stored = localStorage.getItem("isRole") ? true : false;
          const isRole = stored ? JSON.parse(localStorage.getItem("isRole")) : {};
          if (!stored && !!value) { // delete when value set to initial, need to pay caution with e.g. []
            isRole[role] = {[property]: value};
          } else if (isRole[role]) {
            if (!value) {
              // delete when value set to initial, need to pay caution with e.g. []
              delete isRole[role][property];
              if (Object.keys(isRole[role]).length === 0) delete isRole[role];
            } else {
              isRole[role][property] = value;
            }
          }
          if (Object.keys(isRole).length === 0) {
            localStorage.removeItem("isRole");
          } else {
            localStorage.setItem("isRole", JSON.stringify(isRole));
          }
        }
        break;
    }
  });
  // console.log(localStorage);
  // localStorage.clear();
};
