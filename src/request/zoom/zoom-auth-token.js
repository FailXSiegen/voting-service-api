import KJUR from "jsrsasign";
import * as jwt from "jsonwebtoken";
import { findById as findOneEventById } from "../../repository/event-repository";
import { findOneById as findOneZoomMeetingById } from "../../repository/meeting/zoom-meeting-repository";

// todo: refactor this!
export default async function (req, res) {
  const { sdkKey, sdkSecret } = await fetchZoomMeetingRecordByAuthHeader(
    req.headers.authorization,
  );

  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;

  const oHeader = { alg: "HS256", typ: "JWT" };

  const oPayload = {
    sdkKey,
    mn: req.body.meetingNumber,
    role: req.body.role,
    iat: iat,
    exp: exp,
    appKey: sdkKey,
    tokenExp: iat + 60 * 60 * 2,
  };

  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);
  const signature = KJUR.jws.JWS.sign("HS256", sHeader, sPayload, sdkSecret);

  res.json({
    success: true,
    signature: signature,
  });
}

/**
 * todo add errors!
 * @param {string} authHeader
 * @returns {object}
 */
async function fetchZoomMeetingRecordByAuthHeader(authHeader) {
  const token = authHeader.split(" ")[1] || "";
  const decodedToken = jwt.decode(token);
  const eventId = decodedToken?.user?.eventId;

  const event = await findOneEventById(parseInt(eventId, 10));
  const videoConferenceConfig = JSON.parse(event.videoConferenceConfig);

  const zoomMeetingRecord = await findOneZoomMeetingById(
    videoConferenceConfig.id,
  );

  return zoomMeetingRecord;
}
