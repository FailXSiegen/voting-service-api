/* global Promise */
import { findOneById, addPollHint } from '../../../repository/event-user-repository';
import { pubsub } from '../../../server/graphql';
import { UPDATE_EVENT_USER_ACCESS_RIGHTS } from '../subscription/subscription-types';
import { withTransaction } from '../../../lib/database';
import { logVoteTransfer } from '../../../lib/vote-adjustment-logger.js';

const toPositiveInt = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

/**
 * SEC-30: Übertragung atomar – beide Wähler gesperrt (feste Reihenfolge gegen Deadlocks),
 * bedingte Updates, Protokolleintrag in derselben Transaktion. Die Stimmabgabe sperrt dieselbe
 * event_user-Zeile, daher kann zwischen Prüfung des Restkontingents und Übertragung niemand
 * abstimmen.
 */
async function transferInTransaction({ sourceUserId, targetUserId, voteAmount, organizerId }) {
  return withTransaction(async (tx) => {
    const locked = await tx.query(
      `SELECT id, event_id, username, public_name, verified, vote_amount
       FROM event_user WHERE id IN (?, ?) ORDER BY id FOR UPDATE`,
      [sourceUserId, targetUserId]
    );
    const source = locked.find((row) => row.id === sourceUserId);
    const target = locked.find((row) => row.id === targetUserId);

    if (!source || !target) {
      throw new Error('One or both users not found');
    }
    if (source.eventId !== target.eventId) {
      throw new Error('Users must belong to the same event');
    }
    if (!source.verified || !target.verified) {
      throw new Error('Both users must be verified');
    }
    if (source.voteAmount < voteAmount) {
      throw new Error('Source user does not have enough votes');
    }

    // In laufenden Abstimmungen bereits abgegebene Stimmen dürfen nicht erneut abgegeben werden.
    const [used] = await tx.query(
      `SELECT COALESCE(MAX(puv.vote_cycle), 0) AS used
       FROM poll_user_voted puv
       INNER JOIN poll_result pr ON pr.id = puv.poll_result_id
       WHERE puv.event_user_id = ? AND pr.closed = 0`,
      [sourceUserId]
    );
    const usedVotes = parseInt(used?.used, 10) || 0;
    if (voteAmount > source.voteAmount - usedVotes) {
      throw new Error(
        `Bereits abgegebene Stimmen können nicht übertragen werden. Noch übertragbar: ${Math.max(0, source.voteAmount - usedVotes)}.`
      );
    }

    const newSourceVoteAmount = source.voteAmount - voteAmount;
    const newTargetVoteAmount = target.voteAmount + voteAmount;

    const sourceUpdate = await tx.query(
      `UPDATE event_user SET vote_amount = ?, allow_to_vote = ?
       WHERE id = ? AND vote_amount = ? AND vote_amount >= ?`,
      [
        newSourceVoteAmount,
        newSourceVoteAmount > 0 ? 1 : 0,
        sourceUserId,
        source.voteAmount,
        voteAmount,
      ]
    );
    const targetUpdate = await tx.query(
      'UPDATE event_user SET vote_amount = ?, allow_to_vote = 1 WHERE id = ? AND vote_amount = ?',
      [newTargetVoteAmount, targetUserId, target.voteAmount]
    );
    if (sourceUpdate.affectedRows !== 1 || targetUpdate.affectedRows !== 1) {
      throw new Error('Vote transfer failed, please retry');
    }

    const sourceName = source.publicName || source.username;
    const targetName = target.publicName || target.username;
    await logVoteTransfer(
      {
        eventId: source.eventId,
        organizerId,
        sourceUserId,
        targetUserId,
        voteAmount,
        sourceUserName: sourceName,
        targetUserName: targetName,
        sourceUserRemainingVotes: newSourceVoteAmount,
      },
      tx
    );

    return { sourceName, targetName };
  });
}

function publishAccessRights(eventUser) {
  pubsub.publish(
    UPDATE_EVENT_USER_ACCESS_RIGHTS,
    {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
      pollHints: eventUser.pollHints,
    },
    { priority: true }
  );
}

export default {
  transferVotes: async (_, { input }, context) => {
    const sourceUserId = toPositiveInt(input.sourceUserId);
    const targetUserId = toPositiveInt(input.targetUserId);
    const voteAmount = toPositiveInt(input.voteAmount);

    if (!sourceUserId || !targetUserId || !voteAmount) {
      throw new Error('Missing or invalid parameters');
    }
    if (sourceUserId === targetUserId) {
      throw new Error('Cannot transfer votes to the same user');
    }

    const organizerId = context?.user?.type === 'organizer' ? context.user.id : null;
    const { sourceName, targetName } = await transferInTransaction({
      sourceUserId,
      targetUserId,
      voteAmount,
      organizerId,
    });

    // Hinweise für die Oberfläche – nicht Teil der Übertragung selbst.
    await Promise.all([
      addPollHint(targetUserId, voteAmount, sourceName, 'received'),
      addPollHint(sourceUserId, voteAmount, targetName, 'transferred'),
    ]);

    const finalSourceUser = await findOneById(sourceUserId);
    const finalTargetUser = await findOneById(targetUserId);
    publishAccessRights(finalSourceUser);
    publishAccessRights(finalTargetUser);

    return {
      sourceUser: finalSourceUser,
      targetUser: finalTargetUser,
      transferredVotes: voteAmount,
      success: true,
    };
  },
};
