'use strict';
const DOMAIN=process.env.DOMAIN;
const https=require('https');
const mocha=require('mocha');

// api documentation.
// curl command example.
// test method.
// test result example.

/**
    POST /api/v2/poll - create a new poll.
    title: string - title of the poll.
    choices: array<string> - choices for it. Array of the string.
    limit: number - Optional.time limit for voting by seconds. Default is 0.
    type: string - Optional.A type for how to show the result. Default is 'bar'.
    mutable: boolean - Is the vote is immute or not. If true, be able to delete with DELETE /api/v2/vote. Default is false.
    votetype: array<string> - voting option for each choices.
*/
//  curl -X POST https://example.com/api/v2/poll -d "title=test title" -d "choices[]=choice1" -d "choices[]=choice2" -d 1000 -d type=bar -d mutable=false -d votetype[]=one
