--table for poll
CREATE TABLE polls (
id bigint NOT NULL,
account_id int NOT NULL,
title text NOT NULL DEFAULT '',
time_limit timestamp DEFAULT (now())::timestamp ,
created_at timestamp NOTO NULL DEFAULT (now())::timestamp ,
type text NOT NULL DEFAULT 'bar',
choices_id int[] DEFAULT ARRAY[]::integer[],
url text NOT NULL DEFAULT '',
uri text NOT NULL DEFAULT ''
);
-- table for choices
CREATE TABLE choices (
id int NOT NULL;
content text NOT NULL DEFAULT '',
vote int DEFAULT 0
);
-- sequence for poll
CREATE SEQUENCE polls_id_seq OWNED BY polls.id;
CREATE SEQUENCE choices_id_seq OWNED BY choices.id;
ALTER TABLE polls ALTER COLUMN id SET DEFAULT nextval('polls_id_seq');
ALTER TABLE choices ALTER COLUMN id SET DEFAULT nextval('choices_id_seq');
