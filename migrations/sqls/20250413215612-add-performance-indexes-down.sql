-- Remove performance indexes

DROP INDEX idx_poll_user_voted_poll_result_event_user ON poll_user_voted;
DROP INDEX idx_poll_answer_poll_result_id ON poll_answer;
DROP INDEX idx_poll_result_poll_id_closed ON poll_result;
DROP INDEX idx_poll_event_id ON poll;
DROP INDEX idx_poll_user_poll_id_event_user_id ON poll_user;
DROP INDEX idx_event_user_event_id_verified_vote ON event_user;