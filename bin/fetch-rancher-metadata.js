#!/usr/bin/env node
/**
* Global Module fetch-rancher-metadata
*
* @author Jason Hillier <jason@paviasystems.com>
*/

var libFS = require('fs');
var libRequest = require('request');
var libPointer = require('json-pointer');
var libJiff = require('jiff');
var argv = require('yargs').argv;

var _Key = argv.key ? argv.key : 'config';
var _MergeFile = argv.merge ? argv.merge : 'Application-Config.json';
var _WorkDir = process.cwd();
var _RemoteUrl = 'http://rancher-metadata/latest/self/service/metadata';

/**
 * Merge JSON objects, avoiding losing data from within the object tree
 *
 * @method amendTree
 */
function amendTree(pOriginal, pModified)
{
    var tmpDiffset = libJiff.diff(pOriginal, pModified);

    var tmpOutput = pOriginal;

    tmpDiffset.forEach(function(diff)
    {
        switch(diff.op)
        {
            case 'test':
            case 'remove':
                return; //skip/ignore
            case 'replace':
            case 'add':
                //keep only the changes that occurred against the original
                // (populate an empty object with the diff)
                libPointer(tmpOutput, diff.path, diff.value);
                break;
        }
    });
    
    return tmpOutput;
}

/**
 * Fetch JSON metadata from Rancher, do an append-only merge with local JSON file
 *
 * @method main
 */
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
        var tmpTarget = tmpMetadata[_Key];
        amendTree(tmpSource, tmpTarget);

        libFS.writeFileSync(`${_WorkDir}/${_MergeFile}`, JSON.stringify(tmpTarget, null, 4));
        console.log('Updated JSON file:', _MergeFile);
    });
