# mastodon_extension
Node.js mastodon extensive API package.
This pacakage extends mastodon API, but do nothing to Web view.

## How to install
Install `node npm yarn postgresql` and run `yarn install --pure-lock` in this directory.
This package uses the newest version of Node.js, but there're no need to use them.
If you have conflict with versions, remove *package.json* and *yarn.lock* and install package body-parser, cookie-parser, express, pg, and add the text after dep in *package.json*.

After installing npm packages, run `npm createsql` to add table and add systemd start up script as `/etc/systemd/system/mastodon-apiv2.service`.

Example:

```
[Unit]
Description=mastodon-apiv2
After=network.target

[Service]
Type=simple
User=mastodon
WorkingDirectory=/home/mastodon/extension
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run start
TimeoutSec=15
Restart=always

[Install]
WantedBy=multi-user.target
```

Then copy mastodon.env.sample to mastodon.env and edit environmental variables to suit your environment.

Last, add reverse proxy setting to your nginx config file of mastodon.
Copying `/api/v1/streaming` setting and replace `/api/v1/streaming` to `/api/v2/` and change the port of `proxy_pass`.

# Run API v2
To run API v2, `sudo systemctl start mastodon-apiv2`.
This extension requires mastodon is installed and running.You can run this without mastodon, but you must create database before run.
