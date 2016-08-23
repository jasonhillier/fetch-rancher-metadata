#!/usr/bin/env node

var libFS = require('fs');
var libRequest = require('request');
var libMerge = require('merge');
var argv = require('yargs').argv;

var _Key = argv.key ? argv.key : 'config';
var _MergeFile = argv.merge ? argv.merge : 'Application-Config.json';

libRequest({
    method: 'GET',
    url: 'http://rancher-metadata/latest/self/service/metadata',
    json: true,
    timeout: 10
    }, function (err, pResponse)
    {
        if (err)
        {
            console.error(err);
            process.exit(1);
        }

        if (!pResponse.body)
        {
            console.error('No response data received!');
            process.exit(1);
        }

        var tmpMetadata = pResponse.body;
        if (!tmpMetadata[_Key])
        {
            console.error('Specified JSON key not found:', _Key);
            process.exit(1);
        }

        //we want excpetions to be thrown so process exits with errorlevel and descriptive message,
        // so we might as well use sync procedures.
        var tmpSource = JSON.parse(libFS.readFileSync(`${__dirname}/${_MergeFile}`));
        var tmpTarget = libMerge(tmpSourceJSON, tmpMetadata[key]);

        libFS.writeFileSync(`${__dirname}/${_MergeFile}`, JSON.stringify(tmpTarget));
        console.trace('Updated JSON file:', _MergeFile);
        process.exit(0);
    });
