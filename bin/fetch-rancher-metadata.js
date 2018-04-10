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

function writeEnvironmentVars(pEnvironmentVars)
{
    var tmpContent = '#\n';

    for(var k in pEnvironmentVars)
    {
        tmpContent += `export ${k}=${pEnvironmentVars[k]}\n`;
    }

    libFS.writeFileSync(`${_WorkDir}/rancher-env.sh`, tmpContent);
    console.log('Updated file:', 'rancher-env.sh');
}

if (argv.h || argv.help)
{
    console.log('fetch-rancher-metadata command line tool');
    console.log(' --get:\t Request and return specified rancher API value (i.e. "container/name")');
    console.log(' --e:\t\t Fetch rancher service information and set environment variables');
    console.log(' --applyjson:\t Merge JSON specified on command-line into file');
    console.log(' --applyjson:\t Merge JSON specified on command-line into file');
    console.log(' --merge:\t\t File name to merge JSON into');
    console.log(' --file:\t\t File name to merge JSON into (alias)');
    console.log(' --replacename:\t Find and replace value with service_name');
    console.log(' --replacecontainername: Find and replace value with container_name');
    console.log(' --replacefullname: Find and replace value with service_name.stack_name');
}
else if (argv.get)
{
    libRequest({
        method: 'GET',
        url: _RemoteUrl + argv.get,
        json: true,
        timeout: RESPONSE_TIMEOUT
        }, function (err, pResponse)
        {
            if (err)
                return process.exit(1); //indicate to calling program that we've failed them
            
            console.log(pResponse.body);
            return process.exit(0);
        });
}
else if (argv.applyjson)
{
    /**
     * Use JSON data from command-line, do an append-only merge with local JSON file
     */
    var tmpMergeObject = JSON.parse(argv.applyjson);
    return performMerge(tmpMergeObject);
}
else if (argv.replacename || argv.replacefullname || argv.replacecontainername || argv.e)
{
    /**
     * Fetch JSON metadata from Rancher, do an append-only merge with local JSON file
     */

    //Allow command-line to directly specify name without rancher lookup
    // (which also allows use of env variables)
    var tmpServiceName = argv.name;
    var tmpFullServiceName = argv.name;
    var tmpEnvironmentVars = {};

    libAsync.waterfall([
        function(fStageComplete)
        {
            //skip this step if specified
            if (argv.name || argv.replacecontainername)
                return fStageComplete();

            console.log('Fetching metadata from:', _RemoteUrl + 'service/name');
            
            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'service/name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    tmpEnvironmentVars['RANCHER_SERVICE_NAME'] = pResponse.body;
                    tmpServiceName = pResponse.body;
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            if (argv.name || !argv.replacecontainername)
                return fStageComplete();
            
            console.log('Fetching metadata from:', _RemoteUrl + 'container/name');
            
            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'container/name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    tmpEnvironmentVars['RANCHER_CONTAINER_NAME'] = pResponse.body;
                    tmpServiceName = pResponse.body;
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            //skip this step if specified
            if (argv.name)
                return fStageComplete();
            
            console.log('Fetching metadata from:', _RemoteUrl + 'service/stack_name');

            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'service/stack_name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    tmpEnvironmentVars['RANCHER_STACK_NAME'] = pResponse.body;
                    tmpFullServiceName = `${tmpServiceName}.${pResponse.body}`;
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            console.log('Fetching metadata from:', _RemoteUrl + 'stack/environment_name');

            libRequest({
                method: 'GET',
                url: _RemoteUrl + 'stack/environment_name',
                json: true,
                timeout: RESPONSE_TIMEOUT
                }, function (err, pResponse)
                {
                    if (!pResponse)
                        tmpEnvironmentVars['RANCHER_ENV_NAME'] = 'DEV';
                    else
                        tmpEnvironmentVars['RANCHER_ENV_NAME'] = pResponse.body;
                    
                    return fStageComplete(err);
                });
        },
        function(fStageComplete)
        {
            if (argv.replacefullname)
                performReplaceName(argv.replacefullname, tmpFullServiceName);
            if (argv.replacecontainername)
                performReplaceName(argv.replacecontainername, tmpServiceName);
            if (argv.replacename)
                performReplaceName(argv.replacename, tmpServiceName);
            if (argv.e)
                writeEnvironmentVars(tmpEnvironmentVars);
            
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