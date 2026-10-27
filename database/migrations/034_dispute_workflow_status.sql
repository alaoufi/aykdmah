-- PostgreSQL must permit every supported dispute workflow state.
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('open','under_review','waiting_response','escalated','resolved','rejected','closed'));
