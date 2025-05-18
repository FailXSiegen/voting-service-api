import * as jwt from "jsonwebtoken";

export async function generateJwt(claims) {
  return await jwt.sign(claims, process.env.JWT_SECRET, {
    expiresIn: 1000 * 60 * 15, // lasts 15 min
    issuer: process.env.JWT_ISSUER,
  });
}

export async function verifyJwt(token) {
  let result = null;
  await jwt.verify(token, process.env.JWT_SECRET, (error, data) => {
    if (error) {
      throw error;
    }
    result = data;
  });
  return result;
}

/**
 * Generates a new JWT token for event users when their verification status changes
 * @param {number} eventUserId - ID of the event user
 * @param {number} eventId - ID of the event
 * @param {boolean} verificationStatus - Current verification status
 * @returns {Promise<string>} - New JWT token
 */
export async function refreshUserJwtAfterVerification(eventUserId, eventId, verificationStatus) {
  const claims = {
    user: {
      id: eventUserId,
      eventId,
      type: "event-user",
      verified: verificationStatus,
    },
    role: "event-user",
    // For WebSocket authentication
    eventUserId
  };
  
  return await generateJwt(claims);
}
