const PORT=process.env.PORT||4040;
const DATABASE_URL=process.env.DATABASE_URL||'postgresql://mastodon@localhost:5432/mastodon_production';
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
        "draft":"toot draft."
    };
    res.json(extensions);
    res.end();
});

app.post('/api/v2/poll', async (req, res) => {
    const title=req.body.title||'';
    const choices=req.body.choices||[];
    const limit=parseInt(req.body.limit)||0;
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
        'INSERT INTO poll (title,time_limit,type,account_id,created_at,choices_id,url,uri) VALUES ($1,to_timestamp($2),$3,$4,now(),$5,$6,$7) RETURNING *',
        [title, time_limit, type, account_id.rows[0].id,choices_id,"/system/media_attachments/poll/"+(new Date().getTime())+"0","tag:example.com"]);
    await client.end();
    res.json(createJsonForPoll(ret.rows[0], choices_data));
    res.end();
});

app.get('/api/v2/poll', async (req, res) => {
    const id=req.query.id;
    await client.connect();
    const pollData=await client.query(
        'SELECT * FROM poll WHERE id=$1',
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

app.patch('/api/v2/vote', async (req, res) => {
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
        "id":pollData.id,
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
