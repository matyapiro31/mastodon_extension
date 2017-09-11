--table for poll
CREATE TABLE poll (
id bigint,
account_id int,
title text DEFAULT '',
time_limit timestamp DEFAULT (now())::timestamp ,
created_at timestamp DEFAULT (now())::timestamp ,
type text DEFAULT 'bar',
choices_id int[] DEFAULT ARRAY[]::integer[],
url text DEFAULT '',
uri text DEFAULT ''
);
-- table for choices
CREATE TABLE choices (
id int;
content text DEFAULT '',
vote int DEFAULT 0
);
-- sequence for poll
CREATE SEQUENCE poll_id_seq OWNED BY poll;
CREATE SEQUENCE choices_id_seq OWNED BY choices;
ALTER TABLE poll ALTER COLUMN id SET DEFAULT nextval('poll_id_seq');
ALTER TABLE choices ALTER COLUMN id SET DEFAULT nextval('choices_id_seq');
