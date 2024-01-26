import { updatePollResultMaxVotes } from "../repository/poll/poll-result-repository";
import {
  createPollUserWithPollResultId,
  existAsPollUserInCurrentVote,
} from "../repository/poll/poll-user-repository";
import {
  allowToCreateNewVote,
  createPollUserVoted,
  existInCurrentVote,
} from "../repository/poll/poll-user-voted-repository";
import { findOneById } from "../repository/event-user-repository";

/**
 * Creates a new poll user record, if the event-user id does not yet exist.
 * @param {number} pollResultId
 * @param {number} eventUserId
 */
export async function createPollUserIfNeeded(pollResultId, eventUserId) {
  const userExists = await existAsPollUserInCurrentVote(
    pollResultId,
    eventUserId,
  );
  if (userExists === null) {
    const result = await createPollUserWithPollResultId(
      pollResultId,
      eventUserId,
    );
    if (result) {
      await updatePollResultMaxVotes(pollResultId, eventUserId);
    }
  }
}

/**
 * TODO refactor this method...
 * @param {number} pollResultId
 * @param {number} eventUserId
 * @param {number} multiVote
 * @returns {Boolean}
 */
export async function existsPollUserVoted(
  pollResultId,
  eventUserId,
  multiVote,
) {
  const userExists = await existInCurrentVote(pollResultId, eventUserId);
  let voteCycle = 1;
  if (multiVote) {
    const eventUser = await findOneById(eventUserId);
    voteCycle = eventUser.voteAmount;
  }
  if (userExists === null) {
    await createPollUserVoted(pollResultId, eventUserId, voteCycle);
    return true;
  }
  return await allowToCreateNewVote(pollResultId, eventUserId);
}
