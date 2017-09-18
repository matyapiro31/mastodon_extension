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

    await client.connect();
    //get Account ID.
    const account_id=await client.query('SELECT id FROM  oauth_access_tokens WHERE token=$1', [token]);
    console.log(account_id.rows.length===0?"Invalid AccessToken.":"");
    //check if parameter is valid.
    if (!Array.isArray(choices)) {
        res.status(400);
        res.send('Invalid object type: choices[].');
        res.end();
        return 0;
    } else if (account_id.rows.length===0) {
        res.status(400);
        res.send('Invalid object type: choices[].');
        res.end();
        return 0;
    }
    //set choices value.
    for (let i=0;i<choices.length;i++) {
        if ((typeof choices[i])!=="string") {
            res.status(400);
            res.send('Invalid parameter: choices.');
            res.end();
        } else {
            const ret=await client.query('INSERT INTO choices (content) VALUES ($1) RETURNING *', [choices[i]]);
            choices_id.push(ret.rows[0].id);
            choices_data.push({
                content: ret.rows[0].content,
                id: ret.rows[0].id,
                vote: ret.rows[0].vote
            });
        }
    }
    //set time limit as unix time.
    const time_limit=limit+Math.floor(new Date().getTime()/1000);
    const ret=await client.query(
        'INSERT INTO polls (title,time_limit,type,account_id,created_at,choices_id,url,uri) VALUES ($1,to_timestamp($2),$3,$4,now(),$5,$6,$7) RETURNING *',
        [title, time_limit, type, account_id.rows[0].id,choices_id,"/system/media_attachments/poll/"+(new Date().getTime())+"0","tag:example.com"]);
    await client.end();
    res.json(createJsonForPoll(ret.rows[0], choices_data));
    res.end();
});

app.get('/api/v2/poll', async (req, res) => {
    const id=parseInt(req.query.id, 10);
    if (!id) {
        res.end();
    }
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
    const type=req.body.type||"one";//one, any, number, text.
    const token=(req.get('Authorization')||'').substring(7);

    //check if there are valid parameters.
    if (!(polls_id&&choice_id&&token)) {
        res.json({"error":"Invalid parameters."});
    }
    const account_id=await client.query('SELECT id FROM  oauth_access_tokens WHERE token=$1', [token]);
    const pollData=await client.query(
        'SELECT * FROM polls WHERE id=$1',
        [polls_id]
    );
    // a vote of a user by the poll.
    const voubp=await client.query('SELECT * FROM votes WHERE account_id=$1 AND polls_id=$2',
        [account_id,poll_id]
    );
    // a vote of a user by the poll and choice.
    const voubpac=await client.query('SELECT * FROM votes WHERE account_id=$1 AND polls_id=$2 AND choice_id=$3',
        [account_id,poll_id,choice_id]
    );

    let vote;
    switch (type) {
        case "one":
        default:
            //search if the account already voted on the poll.
            if (voubp.rows.length==0) {
                vote=await client.query('INSERT INTO votes (polls_id,account_id,choice_id,type,mutable) VALUES ($1,$2,$3,$4,$5) RETURNING *',
                    polls_id, account_id, choice_id, type, false
                );
            } else {
                res.json({"error": "you already voted."});
            }
            break;
/*      case "any":
            break;
        case "number":
            break;
        case "text":
            break;
*/
    }
    res.json(createJsonForVote(vote.rows[0]));
    res.end();
});

app.post('/api/v2/draft', async (req, res) => {
    let draft=req.body.draft;
    let in_reply_to_id=req.body.in_reply_to_id||'';
    let media_ids=req.body.media_ids||[];
    let sensitive=req.body.sensitive||false;
    let spoiler_text=req.body.spoiler_text;
    let visibility=req.body.visibility||'public';
    res.end();
});
app.patch('/api/v2/draft', function(req, res) {
    //更新する処理を書く。
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
            "choices": choicesData
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
            "type": voteData.type,
            "polls_id": voteData.polls_id,
            "choice_id": voteData.choice_id,
            "mutable": voteData.mutable
        },
        "created_at": voteData.created_at,
        "type": "poll"
    };
}
