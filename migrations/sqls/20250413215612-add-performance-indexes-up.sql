-- Add performance indexes for poll-related operations

-- Index for poll_user_voted to speed up vote status lookups
CREATE INDEX idx_poll_user_voted_poll_result_event_user ON poll_user_voted(poll_result_id, event_user_id);

-- Index for poll_answer to improve answer retrieval performance
CREATE INDEX idx_poll_answer_poll_result_id ON poll_answer(poll_result_id);

-- Index for poll_result to optimize active poll queries
CREATE INDEX idx_poll_result_poll_id_closed ON poll_result(poll_id, closed);

-- Composite index for poll to optimize event-based queries
CREATE INDEX idx_poll_event_id ON poll(event_id);

-- Optimize poll_user lookups
CREATE INDEX idx_poll_user_poll_id_event_user_id ON poll_user(poll_id, event_user_id);

-- Index to speed up event_user queries during voting
CREATE INDEX idx_event_user_event_id_verified_vote ON event_user(event_id, verified, allow_to_vote, online);