import { findOneById, update, addPollHint } from "../../../repository/event-user-repository";
import { pubsub } from "../../../server/graphql";
import { UPDATE_EVENT_USER_ACCESS_RIGHTS } from "../subscription/subscription-types";
import { logVoteTransfer } from "../../../lib/vote-adjustment-logger.js";
// import { getAuditLogger, ACTION_TYPES, PRIVACY_LEVELS } from "../../../lib/audit-logger.js"; // TEMPORARILY DISABLED

export default {
  transferVotes: async (_, { input }, context) => {
    const { sourceUserId, targetUserId, voteAmount } = input;
    // const auditLogger = getAuditLogger(); // TEMPORARILY DISABLED

    // Validate input
    if (!sourceUserId || !targetUserId || !voteAmount) {
      throw new Error("Missing required parameters");
    }

    if (sourceUserId === targetUserId) {
      throw new Error("Cannot transfer votes to the same user");
    }

    if (voteAmount <= 0) {
      throw new Error("Vote amount must be positive");
    }

    // Fetch both users
    const sourceUser = await findOneById(sourceUserId);
    const targetUser = await findOneById(targetUserId);

    if (!sourceUser || !targetUser) {
      throw new Error("One or both users not found");
    }

    // Validate that both users belong to the same event
    if (sourceUser.eventId !== targetUser.eventId) {
      throw new Error("Users must belong to the same event");
    }

    // Validate that source user has enough votes
    if (sourceUser.voteAmount < voteAmount) {
      throw new Error("Source user does not have enough votes");
    }

    // Validate that both users are verified
    if (!sourceUser.verified || !targetUser.verified) {
      throw new Error("Both users must be verified");
    }

    // Calculate new vote amounts
    const newSourceVoteAmount = sourceUser.voteAmount - voteAmount;
    const newTargetVoteAmount = targetUser.voteAmount + voteAmount;

    // Update source user
    await update({
      id: sourceUserId,
      eventId: sourceUser.eventId,
      username: sourceUser.username,
      publicName: sourceUser.publicName,
      verified: sourceUser.verified,
      voteAmount: newSourceVoteAmount,
      allowToVote: newSourceVoteAmount > 0, // Automatically set to visitor if no votes left
    });

    // Update target user
    await update({
      id: targetUserId,
      eventId: targetUser.eventId,
      username: targetUser.username,
      publicName: targetUser.publicName,
      verified: targetUser.verified,
      voteAmount: newTargetVoteAmount,
      allowToVote: true, // Automatically set to participant if receiving votes
    });

    // Add poll hints first
    await Promise.all([
      addPollHint(
        targetUserId,
        voteAmount,
        sourceUser.publicName || sourceUser.username,
        'received'
      ),
      addPollHint(
        sourceUserId,
        voteAmount,
        targetUser.publicName || targetUser.username,
        'transferred'
      )
    ]);

    // Fetch updated users with poll_hints after adding hints
    const finalSourceUser = await findOneById(sourceUserId);
    const finalTargetUser = await findOneById(targetUserId);

    // Notify source user about vote change
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: finalSourceUser.eventId,
      eventUserId: finalSourceUser.id,
      verified: finalSourceUser.verified,
      allowToVote: finalSourceUser.allowToVote,
      voteAmount: finalSourceUser.voteAmount,
      pollHints: finalSourceUser.pollHints,
    });

    // Notify target user about vote change
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: finalTargetUser.eventId,
      eventUserId: finalTargetUser.id,
      verified: finalTargetUser.verified,
      allowToVote: finalTargetUser.allowToVote,
      voteAmount: finalTargetUser.voteAmount,
      pollHints: finalTargetUser.pollHints,
    });


    // Log the vote transfer
    try {
      await logVoteTransfer({
        eventId: sourceUser.eventId,
        organizerId: context?.user?.id || null,
        sourceUserId,
        targetUserId,
        voteAmount,
        sourceUserName: sourceUser.publicName || sourceUser.username,
        targetUserName: targetUser.publicName || targetUser.username,
        sourceUserRemainingVotes: newSourceVoteAmount
      });
    } catch (logError) {
      console.error('[ERROR] Failed to log vote transfer:', logError);
    }

    return {
      sourceUser: finalSourceUser,
      targetUser: finalTargetUser,
      transferredVotes: voteAmount,
      success: true,
    };
  },
};