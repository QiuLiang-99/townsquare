const state = () => ({
  ping: 0,
  rooms: null, // 房间号字符串数组（向后兼容）
  roomList: [], // 房间详情对象数组 { channel, players, name, stName, edition, maxPlayers }
  isReconnecting: false,
  allowReconnect: true
});

const getters = {};

const actions = {};

// mutations helper functions
const set = key => (state, val) => {
  state[key] = val;
};

const mutations = {
  setPing: set("ping"),
  setReconnecting: set("isReconnecting"),
  setAllowConnect: set("allowReconnect")
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
