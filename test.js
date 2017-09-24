const PORT=process.env.PORT||4040;
const DATABASE_URL=process.env.DATABASE_URL||'postgresql://mastodon:mastodon@localhost:5432/mastodon_production';
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
var isConnected=false;
/*
    reddit, poll, timer, draft, stylesheet, call
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
    const choices_data=new Array();
    const mutable=(!!req.body.mutable)||false;
    const vote_type=req.body.vote_type||[];

    if (!isConnected) {
        await client.connect();
        isConnected=true;
    } else {
        client=new pg.Client(DATABASE_URL);
        await client.connect();
    }
    //get Account ID.
    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    console.log(accountData.rows.length===0?"Invalid AccessToken.":"");
    //check if parameter is valid.
    if (!Array.isArray(choices)) {
        fail2end(res, "error":"Invalid object type: choices[].", 400);
        return 400;
    } else if (accountData.rows.length===0) {
        fail2end(res, "error":"Invalid AccessToken.", 400);
        return 400;
    } else if (!Array.isArray(vote_type)) {
        fail2end(res, "error":"Invalid object type: vote_type[].", 400);
        return 400;
    } else if (vote_type.length!==0&&vote_type.length!==choices.length) {
        console.log('vote type is less than choices.Ignoring the latter one.');
    }
    const account_id=accountData.rows[0].resource_owner_id;
    //set choices value.
    for (let i=0;i<choices.length;i++) {
        if ((typeof choices[i])!=="string") {
            res.status(400);
            res.send('Invalid parameter: choices.');
            res.end();
        } else {
            const ret=await client.query('INSERT INTO choices (content,vote_type) VALUES ($1,$2) RETURNING *', [choices[i],vote_type[i]||"one"]);
            choices_id.push(ret.rows[0].id);
            choices_data.push({
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
        [title, time_limit, type, account_id, choices_id, '/system/media_attachments/poll/'+(new Date().getTime())+"0", 'tag:example.com', mutable]);
    await client.end();
    res.json(createJsonForPoll(ret.rows[0], choices_data));
    res.end();
});

app.get('/api/v2/poll', async (req, res) => {
    const id=parseInt(req.query.id, 10);
    if (!id) {
        res.end();
    }
    if (!isConnected) {
            await client.connect();
            isConnected=true;
    } else {
        client=new pg.Client(DATABASE_URL);
        await client.connect();
    }

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
        fail2end(res, "error":"Invalid parameters.", 400);
        return 400;
    }

    const accountData=await client.query('SELECT resource_owner_id FROM  oauth_access_tokens WHERE token=$1', [token]);
    if (accountData.rows.length===0) {
        fail2end(res, "error":"Invalid AccessToken.", 400);
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
        fail2end(res, "Wrong poll id.", 400);
        return 400;
    } else if (!pollData.rows[0].choices_id.includes(choice_id)) {
        fail2end(res, "error":"Wrong choice id.", 400);
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
        fail2end(res, "vote time limit is finished.", 400);
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
        fail2end(res, "you already voted.", 400);
        return 400;
    }
    // vote type for what sends with choice.plain, number, text.
    await client.end();
    res.json(createJsonForVote(vote.rows[0]));
    res.end();
});

app.post('/api/v2/draft', async (req, res) => {
    const draft=req.body.draft;
    const in_reply_to_id=req.body.in_reply_to_id||'';
    const media_ids=req.body.media_ids||[];
    const sensitive=req.body.sensitive||false;
    const spoiler_text=req.body.spoiler_text;
    const visibility=req.body.visibility||'public';
    await client.end();
    res.end();
});
app.patch('/api/v2/draft', function(req, res) {
    //更新する処理を書く。
    await client.end();
    res.end();
});

//id|theme|url
app.get('/api/v2/stylesheet', async (req, res) => {
    let token=req.get('Authorization').substring(7);
    id=getIdByAccessToken();
    if (id) {
        console.log(req.query.theme);
        await client.connect();
      //  const ret = await client.query('SELECT * FROM statuses where id=$1',id);

        await client.end();
    }
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
        "meta": {
            "polls_id": voteData.polls_id,
            "choice_id": voteData.choice_id
        },
        "created_at": voteData.created_at,
        "type": "vote"
    };
}
function fail2end(res,err_str,code) {
    res.status(code);
    res.json({"error": err_str});
    res.end();
}
