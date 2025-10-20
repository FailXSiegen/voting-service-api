import eventQueries from "./resolver/queries/event";
import eventUserQueries from "./resolver/queries/event-user";
import pollQueries from "./resolver/queries/poll";
import pollResultQueries from "./resolver/queries/poll-result";
import cachedPollResultQueries from "./resolver/queries/cached-poll-result";
import organizerQueries from "./resolver/queries/organizer";
import zoomMeetingQueries from "./resolver/queries/zoom-meeting";
import organizerMutations from "./resolver/mutation/organizer";
import eventMutations from "./resolver/mutation/event";
import eventUserMutations from "./resolver/mutation/event-user";
import pollMutations from "./resolver/mutation/poll";
import pollAnswerMutations from "./resolver/mutation/poll-answer";
import pollUserVotedMutations from "./resolver/mutation/poll-user-voted";
import zoomMeetingMutations from "./resolver/mutation/zoom-meeting";
import eventUserAuthTokenMutations from "./resolver/mutation/event-user-auth-token";
import transferVotesMutations from "./resolver/mutation/transfer-votes";
import activePollEventUser from "./resolver/active-poll-event-user/active-poll-event-user";
import pollResolvers from "./resolver/poll/poll";
import eventResolvers from "./resolver/event/event";
import eventUserResolvers from "./resolver/event-user/event-user";
import organizerResolvers from "./resolver/organizer/organizer";
import pollResultResolvers from "./resolver/poll-result/poll-result";
import pollSubscriptionResolvers from "./resolver/subscription/poll";
import eventUserSubscriptionResolvers from "./resolver/subscription/event-user";
import poolAnswerSubscriptionResolvers from "./resolver/subscription/poll-answer";
import votingDetailsSubscriptionResolvers from "./resolver/subscription/voting-details";
const staticContentResolvers = require("./resolver/static-content-resolver");
const pageSlugResolvers = require("./resolver/page-slug-resolver");
const mediaResolvers = require("./resolver/media-resolver");
const systemSettingsResolvers = require("./resolver/system-settings-resolver");
const translationsResolvers = require("./resolver/translations-resolver");

export default {
  VideoConferenceType: {
    ZOOM: 1,
  },
  Query: {
    ...eventQueries,
    ...eventUserQueries,
    ...pollQueries,
    ...pollResultQueries,
    ...cachedPollResultQueries,
    ...organizerQueries,
    ...zoomMeetingQueries,
    ...staticContentResolvers.Query,
    ...pageSlugResolvers.Query,
    ...mediaResolvers.Query,
    ...systemSettingsResolvers.Query,
    ...translationsResolvers.Query,
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations,
    ...pollMutations,
    ...pollAnswerMutations,
    ...eventUserMutations,
    ...pollUserVotedMutations,
    ...zoomMeetingMutations,
    ...eventUserAuthTokenMutations,
    ...transferVotesMutations,
    ...staticContentResolvers.Mutation,
    ...pageSlugResolvers.Mutation,
    ...mediaResolvers.Mutation,
    ...systemSettingsResolvers.Mutation,
    ...translationsResolvers.Mutation,
  },
  ActivePollEventUser: {
    ...activePollEventUser,
  },
  Poll: {
    ...pollResolvers,
  },
  Event: {
    ...eventResolvers,
  },
  EventUser: {
    ...eventUserResolvers,
  },
  Organizer: {
    ...organizerResolvers,
  },
  PollResult: {
    ...pollResultResolvers,
  },
  Subscription: {
    ...pollSubscriptionResolvers,
    ...eventUserSubscriptionResolvers,
    ...poolAnswerSubscriptionResolvers,
    ...votingDetailsSubscriptionResolvers,
  },
  StaticContent: {
    ...staticContentResolvers.StaticContent,
  },
  StaticContentVersion: {
    ...staticContentResolvers.StaticContentVersion,
  },
  PageSlug: {
    // Add any field resolvers for PageSlug if needed
  },
  Media: {
    ...mediaResolvers.Media,
  },
  SystemSettings: {
    ...systemSettingsResolvers.SystemSettings,
  },
};
