#!/usr/bin/env node

var libFS = require('fs');
var libRequest = require('request');
var libMerge = require('merge-object');
var argv = require('yargs').argv;

var _Key = argv.key ? argv.key : 'config';
var _MergeFile = argv.merge ? argv.merge : 'Application-Config.json';
var _WorkDir = process.cwd();
var _RemoteUrl = 'http://rancher-metadata/latest/self/service/metadata';

console.log('Fetching metadata from:', _RemoteUrl);

libRequest({
    method: 'GET',
    url: _RemoteUrl,
    json: true,
    timeout: 2000
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
        var tmpSource = JSON.parse(libFS.readFileSync(`${_WorkDir}/${_MergeFile}`));
        var tmpTarget = libMerge(tmpSource, tmpMetadata[_Key]);

        libFS.writeFileSync(`${_WorkDir}/${_MergeFile}`, JSON.stringify(tmpTarget, null, 4));
        console.log('Updated JSON file:', _MergeFile);
    });
