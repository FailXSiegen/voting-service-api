import { findOneById } from '../../../repository/organizer-repository'

export default {
  organizer: async ({ organizerId }) => {
    return await findOneById(organizerId)
  },
  lobbyOpen: async ({ lobbyOpen }) => {
    return lobbyOpen === 1 || lobbyOpen === true
  },
  active: async ({ active }) => {
    return active === 1 || active === true
  }
}
