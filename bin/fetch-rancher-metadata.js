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
var libAsync = require('async');
var argv = require('yargs').argv;

var _Key = argv.key ? argv.key : 'config';
var _MergeFile = argv.merge ? argv.merge : 'Application-Config.json';
var _MergeFile = argv.file ? argv.file : _MergeFile;
var _WorkDir = process.cwd();
var _RemoteUrl = 'http://rancher-metadata/latest/self/';
var RESPONSE_TIMEOUT = 3000;

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
 * Perform merge operation using merge object into target file.
 *
 * @method performMerge
 */
function performMerge(pMergeObject)
{
    //we want excpetions to be thrown so process exits with errorlevel and descriptive message,
    // so we might as well use sync procedures.
    var tmpSource = JSON.parse(libFS.readFileSync(`${_WorkDir}/${_MergeFile}`));
    var tmpTarget = amendTree(tmpSource, pMergeObject);

    libFS.writeFileSync(`${_WorkDir}/${_MergeFile}`, JSON.stringify(tmpTarget, null, 4));
    console.log('Updated JSON file:', _MergeFile);
}

function performReplaceName(pFromName, pNewName)
{
    var tmpSource = libFS.readFileSync(`${_WorkDir}/${_MergeFile}`) + '';

    var tmpTarget = tmpSource.replace(new RegExp(pFromName, 'g'), pNewName);

    libFS.writeFileSync(`${_WorkDir}/${_MergeFile}`, tmpTarget);
    console.log('Updated file:', _MergeFile);
}

if (argv.applyjson)
{
    /**
     * Use JSON data from command-line, do an append-only merge with local JSON file
     */
    var tmpMergeObject = JSON.parse(argv.applyjson);
    return performMerge(tmpMergeObject);
}
else if (argv.replacename || argv.replacefullname)
{
    /**
     * Fetch JSON metadata from Rancher, do an append-only merge with local JSON file
     */

    //Allow command-line to directly specify name without rancher lookup
    // (which also allows use of env variables)
    var tmpContainerName = argv.name;
    var tmpFullContainerName = argv.name;

    libAsync.waterfall([
        function(fStageComplete)
        {
            //skip this step if specified
            if (argv.name)
                return fStageComplete();

            console.log('Fetching metadata from:', _RemoteUrl + 'container/name');
            
            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'container/name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    tmpContainerName = pResponse.body;
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            //skip this step if specified
            if (argv.name)
                return fStageComplete();
            
            console.log('Fetching metadata from:', _RemoteUrl + 'container/stack_name');

            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'container/stack_name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    tmpFullContainerName = `${tmpContainerName}.${pResponse.body}`;
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            if (argv.replacename)
                performReplaceName(argv.replacename, tmpContainerName);
            if (argv.replacefullname)
                performReplaceName(argv.replacefullname, tmpFullContainerName);
            
            return fStageComplete();
        }
    ], function(err)
    {
        if (err)
        {
            console.error(err);
            return;
        }
    });
}
else
{
    /**
     * Fetch JSON metadata from Rancher, do an append-only merge with local JSON file
     */
    console.log('Fetching metadata from:', _RemoteUrl + 'service/metadata');

    libRequest({
        method: 'GET',
        url: _RemoteUrl + 'service/metadata',
        json: true,
        timeout: RESPONSE_TIMEOUT
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

            return performMerge(tmpMetadata[_Key]);
        });
}