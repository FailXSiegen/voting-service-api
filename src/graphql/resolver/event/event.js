export default {
  lobbyOpen: async ({ lobbyOpen }) => {
    return lobbyOpen === 1 || lobbyOpen === true
  },
  active: async ({ active }) => {
    return active === 1 || active === true
  }
}
