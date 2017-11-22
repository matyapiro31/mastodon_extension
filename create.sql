--table for poll
CREATE TABLE polls (
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    title text NOT NULL DEFAULT '',
    time_limit timestamp DEFAULT (now())::timestamp ,
    created_at timestamp NOT NULL DEFAULT (now())::timestamp ,
    type text NOT NULL DEFAULT 'bar',
    mutable boolean DEFAULT false,
    choices_id bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
    url text NOT NULL DEFAULT '',
    uri text NOT NULL DEFAULT ''
);
-- table for choices
CREATE TABLE choices (
    id bigint NOT NULL;
    content text NOT NULL DEFAULT '',
    vote int DEFAULT 0,
    vote_type text DEFAULT 'one'
);
-- sequence for poll
CREATE SEQUENCE polls_id_seq OWNED BY polls.id;
CREATE SEQUENCE choices_id_seq OWNED BY choices.id;
ALTER TABLE polls ALTER COLUMN id SET DEFAULT nextval('polls_id_seq');
ALTER TABLE choices ALTER COLUMN id SET DEFAULT nextval('choices_id_seq');
-- table for vote
CREATE TABLE votes (
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    polls_id bigint NOT NULL,
    choice_id bigint NOT NULL,
    data text DEFAULT '',
    created_at timestamp NOT NULL DEFAULT (now())::timestamp
);
-- sequence for vote
CREATE SEQUENCE votes_id_seq OWNED BY votes.id;
ALTER TABLE votes ALTER COLUMN id SET DEFAULT nextval('votes_id_seq');
-- table for draft
CREATE TABLE drafts (
    id int NOT NULL,
    account_id bigint NOT NULL,
    draft text NOT NULL DEFAULT '',
    in_reply_to_id int,
    media_ids int[] DEFAULT ARRAY[]::integer[],
    sensitive boolean DEFAULT false,
    spoiler_text text NOT NULL DEFAULT '',
    visibility text NOT NULL DEFAULT 'public',
    timer timestamp
);
-- sequence for draft
CREATE SEQUENCE drafts_id_seq OWNED BY drafts.id;
ALTER TABLE draft ALTER COLUMN id SET DEFAULT nextval('drafts_id_seq');
