import eventQueries from "./resolver/queries/event";
import eventUserQueries from "./resolver/queries/event-user";
import pollQueries from "./resolver/queries/poll";
import pollResultQueries from "./resolver/queries/poll-result";
import organizerQueries from "./resolver/queries/organizer";
import zoomMeetingQueries from "./resolver/queries/zoom-meeting";
import userVoteCycleQueries from "./resolver/queries/user-vote-cycle";
import organizerMutations from "./resolver/mutation/organizer";
import eventMutations from "./resolver/mutation/event";
import eventUserMutations from "./resolver/mutation/event-user";
import pollMutations from "./resolver/mutation/poll";
import pollAnswerMutations from "./resolver/mutation/poll-answer";
import pollUserVotedMutations from "./resolver/mutation/poll-user-voted";
import zoomMeetingMutations from "./resolver/mutation/zoom-meeting";
import eventUserAuthTokenMutations from "./resolver/mutation/event-user-auth-token";
import activePollEventUser from "./resolver/active-poll-event-user/active-poll-event-user";
import pollResolvers from "./resolver/poll/poll";
import eventResolvers from "./resolver/event/event";
import organizerResolvers from "./resolver/organizer/organizer";
import pollResultResolvers from "./resolver/poll-result/poll-result";
import pollSubscriptionResolvers from "./resolver/subscription/poll";
import eventUserSubscriptionResolvers from "./resolver/subscription/event-user";
import poolAnswerSubscriptionResolvers from "./resolver/subscription/poll-answer";
import votingDetailsSubscriptionResolvers from "./resolver/subscription/voting-details";
import staticContentResolvers from "./resolver/static-content-resolver";
import pageSlugResolvers from "./resolver/page-slug-resolver";
import mediaResolvers from "./resolver/media-resolver";
import systemSettingsResolvers from "./resolver/system-settings-resolver";
import translationsResolvers from "./resolver/translations-resolver";

export default {
  VideoConferenceType: {
    ZOOM: 1,
  },
  Query: {
    ...eventQueries,
    ...eventUserQueries,
    ...pollQueries,
    ...pollResultQueries,
    ...organizerQueries,
    ...zoomMeetingQueries,
    ...userVoteCycleQueries,
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
