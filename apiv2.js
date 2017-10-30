'use strict';
const PORT=process.env.PORT||4040;
const DATABASE_URL=process.env.DATABASE_URL||'postgresql://mastodon@localhost:5432/mastodon_production';
const CSS_PATH=process.env.CSS_PATH||'./mastodon.css';
const fs=require('fs');
const pg=require('pg');
const express=require('express');
const app=express();
const bodyParser = require('body-parser');
process.on('unhandledRejection', console.dir);

/*
    express setting.
*/
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
/* pg setting. */
var client=new pg.Client(DATABASE_URL);

/*
    poll, timer, draft, stylesheet, call
*/
app.get('/api/v2/version', (req, res) => {
    let info={
        "version":"1.0.0"
    };
    res.json(info);
    res.end();
});

app.get('/api/v2/extension', (req, res) => {
    let extensions={
        "version":"show extension version.",
        "poll":"request poll.",
        "vote":"vote.",
        "draft":"toot draft."
    };
    res.json(extensions);
    res.end();
});

app.post('/api/v2/poll', async (req, res) => {
    const title=req.body.title||'';
    const choices=req.body.choices||[];
    const limit=parseInt(req.body.limit)|0;
    const type=req.body.type||'bar';
    const token=(req.get('Authorization')||'').substring(7);
    const choices_id=new Array();
    const choicesData=new Array();
    const mutable=(!!req.body.mutable)||false;
    const vote_type=req.body.vote_type||[];

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    if (!token) {
        fail2end(res, 'No Access Token set.', 400);
        return 400;
    }

    //get Account ID.
    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    }
    //check if parameter is valid.
    if (!Array.isArray(choices)) {
        fail2end(res, 'Invalid object type: choices[].', 400);
        return 400;
    } else if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    } else if (!Array.isArray(vote_type)) {
        fail2end(res, 'Invalid object type: vote_type[].', 400);
        return 400;
    } else if (vote_type.length!==0&&vote_type.length!==choices.length) {
        console.log('vote type is less than choices.Ignoring the latter one.');
    }
    const account_id=accountData.rows[0].resource_owner_id;
    //set choices value.
    for (let i=0;i<choices.length;i++) {
        if ((typeof choices[i])!=='string') {
            res.status(400);
            res.send('Invalid parameter: choices.');
            res.end();
        } else {
            const ret=await client.query('INSERT INTO choices (content,vote_type) VALUES ($1,$2) RETURNING *', [choices[i],vote_type[i]||'one']);
            choices_id.push(ret.rows[0].id);
            choicesData.push({
                "content": ret.rows[0].content,
                "id": ret.rows[0].id,
                "vote": ret.rows[0].vote,
                "vote_type": ret.rows[0].vote_type
            });
        }
    }
    //set time limit as unix time.
    const time_limit=limit+Math.floor(new Date().getTime()/1000);
    const ret=await client.query(
        'INSERT INTO polls (title,time_limit,type,account_id,created_at,choices_id,url,uri,mutable) VALUES ($1,to_timestamp($2),$3,$4,now(),$5,$6,$7,$8) RETURNING *',
        [title, time_limit, type, account_id, choices_id, '/system/media_attachments/poll/'+(new Date().getTime())+'0', 'tag:example.com', mutable]);
    await client.end();
    res.json(createJsonForPoll(ret.rows[0], choicesData));
    res.end();
});

app.get('/api/v2/poll', async (req, res) => {
    const id=parseInt(req.query.id, 10);
    if (!id) {
        res.end();
    }
    client=new pg.Client(DATABASE_URL);
    await client.connect();

    //validate if id is exists.
    const pollRange=await client.query(
        'SELECT last_value FROM polls_id_seq'
    );
    if (id<1 || id>pollRange.rows[0].last_value) {
        res.end();
    }
    const pollData=await client.query(
        'SELECT * FROM polls WHERE id=$1',
        [id]
    );
    const choicesData=new Array();
    for (let i in pollData.rows[0].choices_id) {
        let choice=await client.query(
                'SELECT * FROM choices WHERE id=$1',
                [pollData.rows[0].choices_id[i]]
        );
        choicesData.push(choice.rows[0]);
    }
    await client.end();
    res.json(createJsonForPoll(pollData.rows[0], choicesData));
    res.end();
});

app.post('/api/v2/vote', async (req, res) => {
    const polls_id=req.body.poll|0;
    const choice_id=req.body.choice|0;
    const data=req.body.data||'';
    const token=(req.get('Authorization')||'').substring(7);

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    //check if there are valid parameters.
    if (!(polls_id&&choice_id&&token)) {
        fail2end(res, 'Invalid parameters.', 400);
        return 400;
    }

    if (!token) {
        fail2end(res, 'No Access Token set.', 400);
        return 400;
    }

    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    }
    const account_id=accountData.rows[0].resource_owner_id;
    const pollData=await client.query(
        'SELECT * FROM polls WHERE id=$1',
        [polls_id]
    );
    const choiceData=await client.query(
        'SELECT * FROM choices WHERE id=$1',
        [choice_id]
    );
    if (pollData.rows.length===0) {
        fail2end(res, 'Wrong poll id.', 400);
        return 400;
    } else if (!pollData.rows[0].choices_id.includes(choice_id)) {
        fail2end(res, 'Wrong choice id.', 400);
        return 400;
    }

    const type=choiceData.rows[0].vote_type.toString()||'one'; //one, any, number, text.
    // a vote of a user by the poll.
    const voubp=await client.query('SELECT * FROM votes WHERE account_id=$1 AND polls_id=$2',
        [account_id,polls_id]
    );
    // a vote of a user by the poll and choice.
    const voubpac=await client.query('SELECT * FROM votes WHERE account_id=$1 AND polls_id=$2 AND choice_id=$3',
        [account_id,polls_id,choice_id]
    );

    if (pollData.rows[0].time_limit < new Date()) {
        fail2end(res, 'vote time limit is finished.', 400);
        return 400;
    }
    let vote;
    // vote type for the way to select.

    // one: only select one answer for polls. cannot mix with any.
    // any: able to select all you like.cannot mix with one.
    // search if the account already voted on the poll.
    if ((type=='one' && voubp.rows.length==0) || (type=='any' && voubpac.rows.length==0)) {
        vote=await client.query('INSERT INTO votes (polls_id,account_id,choice_id,data) VALUES ($1,$2,$3,$4) RETURNING *',
            [polls_id, account_id, choice_id,data]
        );
        let v=choiceData.rows[0].vote+1;
        await client.query('UPDATE choices SET vote=$1 WHERE id=$2', [v,choice_id]);
    } else {
        fail2end(res, 'you already voted.', 400);
        return 400;
    }
    // vote type for what sends with choice.plain, number, text.
    await client.end();
    res.json(createJsonForVote(vote.rows[0]));
    res.end();
});

app.post('/api/v2/draft', async (req, res) => {
    const draft=(req.body.draft||'').substring(0,1000);
    const in_reply_to_id=parseInt(req.body.in_reply_to_id)|null;
    const _media_ids=req.body.media_ids||[];
    const sensitive=req.body.sensitive||false;
    const spoiler_text=req.body.spoiler_text||'';
    const visibility=req.body.visibility||'public';
    const timer=req.body.timer|0;
    const token=(req.get('Authorization')||'').substring(7);

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    if (_media_ids.length > 4) {
        fail2end(res,'over 4 medias attached.', 502);
        return 502;
    }

    if (!token) {
        fail2end(res, 'No Access Token set.', 400);
        return 400;
    }
    //get Account ID.
    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    }
    const account_id=accountData.rows[0].resource_owner_id;
    // check visibility value.
    switch (visibility) {
        case 'public':
        case 'unlisted':
        case 'private':
        case 'direct':
            break;
        default:
            visibility='public';
    }

    let media_ids=new Array();
    for (let i in _media_ids) {
        if (!Number.isNaN(parseInt(_media_ids[i]))) {
            media_ids.push(parseInt(_media_ids[i]));
        }
    }

    let draftData=await client.query('INSERT INTO drafts (account_id,draft,in_reply_to_id,media_ids,sensitive,spoiler_text,visibility,timer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [account_id,draft,in_reply_to_id,media_ids,sensitive,spoiler_text,visibility,timer]
    );
    await client.end();
    res.json(createJsonForDraft(draftData.rows[0]));
    res.end();
});

app.patch('/api/v2/draft', async (req, res) => {
    const draft_id=req.body.id|0;
    const draft=req.body.draft||'';
    const token=(req.get('Authorization')||'').substring(7);

    if (!draft_id) {
        fail2end(res, 'draft id is not set.', 400);
        return 400;
    } else if (!draft) {
        fail2end(res, 'draft data is empty.', 502);
        return 502;
    }

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    if (!token) {
        fail2end(res, 'No Access Token set.', 400);
        return 400;
    }

    //get Account ID.
    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    }
    const account_id=accountData.rows[0].resource_owner_id;
    const draft_accountData=await client.query('SELECT account_id FROM drafts WHERE id=$1',  [draft_id]);
    if (draft_accountData.rows.length===0) {
        fail2end(res, 'Wrong id for a draft.', 502);
        return 502;
    } else if (draft_accountData.rows[0].account_id!=account_id) {
        fail2end(res, 'Incorrect account id for the draft.', 400);
        return 400;
    }
    let draftData=await client.query('UPDATE drafts SET draft=$1 WHERE id=$2 RETURNING *', [draft,draft_id]);
    await client.end();
    res.json(createJsonForDraft(draftData.rows[0]));
    res.end();
});

app.get('/api/v2/draft', async (req, res) => {
    const draft_id=req.query.id|0;
    const token=(req.get('Authorization')||'').substring(7);
    let draftData;

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    if (draft_id) { // get draft data of the exact id.
        draftData=await client.query('SELECT * FROM drafts WHERE id=$1', [draft_id]);
        res.json(createJsonForDraft(draftData.rows[0]));
    } else if (token) { // get all draft data for the user.
        const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
        if (accountData.rows.length===0) {
            fail2end(res, 'Invalid AccessToken.', 400);
            return 400;
        }
        const account_id=accountData.rows[0].resource_owner_id;
        draftData=await client.query('SELECT * FROM drafts WHERE account_id=$1', [account_id]);
        res.json(createJsonForDrafts(draftData.rows, account_id));
    } else {
        fail2end(res, 'No data is set.', 400);
        return 400;
    }
    await client.end();
    res.end();
});

app.delete('/api/v2/draft', async (req, res) => {
    const draft_id=req.body.id|0;
    const token=(req.get('Authorization')||'').substring(7);

    if (!draft_id) {
        fail2end(res, 'draft id is not set.', 400);
        return 400;
    }

    if (!token) {
        fail2end(res, 'No Access Token set.', 400);
        return 400;
    }

    client=new pg.Client(DATABASE_URL);
    await client.connect();

    const accountData=await client.query('SELECT resource_owner_id FROM oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, 'Invalid AccessToken.', 400);
        return 400;
    }
    const account_id=accountData.rows[0].resource_owner_id;
    let draftData=await client.query('SELECT * FROM drafts WHERE id=$1 AND account_id=$2', [draft_id,account_id]);
    if (draftData.rows.length===0) {
        fail2end(res, 'These draft data are no longer exist.', 502);
        return 502;
    } else {
        await client.query('DELETE FROM drafts WHERE id=$1', [draft_id]);
        res.json(createJsonForMessage('delete', 'draft id='+ draft_id+' is deleted.', 'success'));
    }

    await client.end();
    res.end();
});

app.get('/api/v2/stylesheet', async (req, res) => {
    const theme=req.body.theme;
    const hue_degree=req.body.hue_degree|0;
    
    if (theme) {
        CSS_PATH=CSS_PATH.replace(/\.css/, '-'+theme+'.css');
    }
    const style=fs.readFileSync(CSS_PATH, 'utf8');
    res.send(style);
    res.end();
});

app.listen(PORT, (err) => {
    if (!err) {
        console.log('Server is running at port', PORT);
    } else {
        console.log(JSON.stringify(err));
    }
});

function createJsonForPoll(pollData,choicesData) {
    return {
        "id": pollData.id,
        "account_id": pollData.account_id,
        "limit": pollData.time_limit,
        "meta": {
            "title": pollData.title,
            "type": pollData.type,
            "choices": choicesData,
            "mutable": pollData.mutable
        },
        "created_at": pollData.created_at,
        "type": "poll",
        "url": pollData.url,
        "uri": pollData.uri
    };
}
function createJsonForVote(voteData) {
    return {
        "id": voteData.id,
        "account_id": voteData.account_id,
        "meta": {
            "polls_id": voteData.polls_id,
            "choice_id": voteData.choice_id
        },
        "created_at": voteData.created_at,
        "type": "vote"
    };
}
function createJsonForDraft(draftData) {
    return {
        "id": draftData.id,
        "account_id": draftData.account_id,
        "meta": {
            "draft": draftData.draft,
            "in_reply_to_id": draftData.in_reply_to_id,
            "media_ids": draftData.media_ids,
            "sensitive": draftData.sensitive,
            "spoiler_text": draftData.spoiler_text,
            "visibility": draftData.visibility,
            "timer": draftData.timer
        },
        "type": "draft"
    };
}
function createJsonForDrafts(draftDataArray, account_id) {
    const ret={
        "account_id": account_id,
        "drafts": [],
        "type": "drafts"
    };
    for (let draftData of draftDataArray) {
        ret.drafts.push(
            {
                "id": draftData.id,
                "account_id": draftData.account_id,
                "meta": {
                    "draft": draftData.draft,
                    "in_reply_to_id": draftData.in_reply_to_id,
                    "media_ids": draftData.media_ids,
                    "sensitive": draftData.sensitive,
                    "spoiler_text": draftData.spoiler_text,
                    "visibility": draftData.visibility,
                    "timer": draftData.timer
                },
                "type": "draft"
            }
        );
    }
    return ret;
}
function createJsonForMessage(type, message, status) {
    return {
        "type": type,
        "message": message,
        "status": status
    };
}
function fail2end(res, errorMessage, code) {
    res.status(code);
    res.json(
        {
            "code": code,
            "meta": createJsonForMessage('error', errorMessage, 'failed'),
            "type": "message"
        }
    );
    res.end();
}
