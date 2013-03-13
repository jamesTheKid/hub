/**
 * Created with JetBrains WebStorm.
 * User: gnewcomb
 * Date: 3/1/13
 * Time: 8:55 AM
 * To change this template use File | Settings | File Templates.
 */


var chai = require('chai');
var expect = chai.expect;
var superagent = require('superagent');
var crypto = require('crypto');
var async = require('async');
var http = require('http');
var ws = require('ws');


var testRandom = require('.././js_testing_utils/randomUtils.js');

var GET_LATEST_SUCCESS_RESPONSE = 303;
var CHANNEL_CREATION_SUCCESS_RESPONSE = 200;
var DATA_POST_SUCCESS_RESPONSE = 200;
exports.CHANNEL_CREATION_SUCCESS = CHANNEL_CREATION_SUCCESS_RESPONSE;
exports.DATA_POST_SUCCESS = DATA_POST_SUCCESS_RESPONSE;
exports.GET_LATEST_SUCCESS = GET_LATEST_SUCCESS_RESPONSE;


var URL_ROOT = 'http://datahub-01.cloud-east.dev:8080';
exports.URL_ROOT = URL_ROOT;

var getValidationString = function (myUri, myPayload, myDone)
{
    var myData = '';
    http.get(myUri, function(res) {
        res.on('data', function (chunk) {
            myData += chunk;
        }).on('end', function(){
                expect(myData).to.equal(myPayload);
                myDone();
            });
    }).on('error', function(e) {
            console.log("Got error: " + e.message);
            myDone();
        });
};
exports.getValidationString = getValidationString;


var getValidationChecksum = function (myUri, expChecksum, myDone)
{
    var md5sum = crypto.createHash('md5');
    var actChecksum;

    http.get(myUri, function(res) {
        res.on('data', function (chunk) {
            md5sum.update(chunk);
        }).on('end', function(){
                actChecksum = md5sum.digest('hex');
                expect(actChecksum).to.equal(expChecksum);
                myDone();
            });
    }).on('error', function(e) {
            console.log("Got error: " + e.message);
            myDone();
        });

};
exports.getValidationChecksum = getValidationChecksum;

// Given a channelname, this returns a websocket on that channel
var createWebSocket = function(channelName) {
    var myWs = new ws(URL_ROOT +'/'+ channelName +'/ws');

    return myWs;
}
exports.createWebSocket = createWebSocket;

// returns the POST response
var makeChannel = function(myChannelName, myCallback) {

    var myPayload = '{"name":"'+ myChannelName +'"}';

    superagent.agent().post(URL_ROOT +'/channel')
        .set('Content-Type', 'application/json')
        .send(myPayload)
        .end(function(err, res) {
            myCallback(res);
        }).on('error', function(e) {
            myCallback(e);
        });
}
exports.makeChannel = makeChannel;

var makeRandomChannelName = function() {
    return testRandom.randomString(testRandom.randomNum(31), testRandom.limitedRandomChar);
}
exports.makeRandomChannelName = makeRandomChannelName;

//     Current metadata structure for GET on a channel:
/*
 {  _links:
 {   self:
 {   href: 'http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks' },
 latest:
 {   href: 'http://datahub-01.cloud-east.dev:8080/channel/philcollinssucks/latest' }
 },
 name: 'philcollinssucks',
 creationDate: '2013-02-25T23:57:49.477Z'
 }
 */
function channelMetadata(responseBody) {
    this.getChannelUri = function() {
        return responseBody._links.self.href;
    }

    this.getLatestUri = function() {
        return responseBody._links.latest.href;
    }

    this.getName = function() {
        return responseBody.name;
    }

    this.getCreationDate = function() {
        return responseBody.creationDate;
    }
}
exports.channelMetadata = channelMetadata;

var getChannel = function(myChannelName, myCallback) {
    superagent.agent().get(URL_ROOT +'/channel/'+ myChannelName)
        .end(function(err, res) {
            if (err) {throw err};
            myCallback(res);
        });
};
exports.getChannel = getChannel;

/* Basic health check.
    Returns the get response or throws an error.
 */
var getHealth = function(myCallback) {
    superagent.agent().get(URL_ROOT + '/health')
        .end(function(err,res) {
            if (err) {throw err};
            myCallback(res);
        });
};
exports.getHealth = getHealth;


function packetMetadata(responseBody) {

    this.getChannelUri = function() {
        return responseBody._links.channel.href;
    }

    this.getPacketUri = function() {
        return responseBody._links.self.href;
    }

    this.getId = function() {
        return responseBody.id;
    }

    this.getTimestamp = function() {
        return responseBody.timestamp;
    }
}
exports.packetMetadata = packetMetadata;

// Headers in a response to GET on a packet of data
function packetGETHeader(responseHeader){

    // returns null if no 'previous' header found
    this.getNext = function() {
        //console.log("Called getNext() with responseHeader: ");
        //console.dir(responseHeader);

        if (responseHeader.hasOwnProperty("link")) {
            var m = /<([^<]+)>;rel=\"next\"/.exec(responseHeader["link"]);
            return (null == m) ? null : m[1];
        }
        else {
            return null;
        }
    }

    // returns null if no 'previous' header found
    this.getPrevious = function() {
        //console.log("Called getPrevious() with responseHeader: ");
        //console.dir(responseHeader);

        if (responseHeader.hasOwnProperty("link")) {
            var m = /<([^<]+)>;rel=\"previous\"/.exec(responseHeader["link"]);
            return (null == m) ? null : m[1];
        }
        else {
            return null;
        }
    }
}
exports.packetGETHeader = packetGETHeader;


// Headers in response to POSTing a packet of data
function packetPOSTHeader(responseHeader){
    this.getLocation = function() {
        if (responseHeader.hasOwnProperty("location")) {
            return responseHeader["location"];
        }
        else {
            return null;
        }
    }
}
exports.packetPOSTHeader = packetPOSTHeader;

// Posts data and returns (response, URI)
var postData = function(myChannelName, myData, myCallback) {
    var uri = URL_ROOT +'/channel/'+ myChannelName;
    var dataUri;

    superagent.agent().post(uri)
        .send(myData)
        .end(function(err, res) {
            if (err) throw err;

            if (DATA_POST_SUCCESS_RESPONSE != res.status) {
                dataUri = null;
            }
            else {
                var pMetadata = new packetMetadata(res.body);
                dataUri = pMetadata.getPacketUri();
            }

            myCallback(res, dataUri);
        });
};
exports.postData = postData;

// Returns GET response in callback
var postDataAndConfirmContentType = function(myChannelName, myContentType, myCallback) {

    var payload = testRandom.randomString(testRandom.randomNum(51));
    var uri = URL_ROOT +'/channel/'+ myChannelName;
    var getAgent = superagent.agent();
    var agent = superagent.agent();

    agent.post(uri)
        .set('Content-Type', myContentType)
        .send(payload)
        .end(function(err, res) {
            if (err) throw err;
            expect(res.status).to.equal(DATA_POST_SUCCESS_RESPONSE);
            uri = res.body._links.self.href;

            getAgent.get(uri)
                .end(function(err2, res2) {
                    if (err2) throw err2;
                    expect(res2.type.toLowerCase()).to.equal(myContentType.toLowerCase());
                    myCallback(res2);
                });

        });
};
exports.postDataAndConfirmContentType = postDataAndConfirmContentType;

// Returns data
var getLatestFromChannel = function(myChannelName, myCallback) {
    var getUri = URL_ROOT +'/channel/'+ myChannelName +'/latest';

    async.waterfall([
        function(callback){
            superagent.agent().get(getUri)
                .redirects(0)
                .end(function(err, res) {
                    expect(res.status).to.equal(GET_LATEST_SUCCESS_RESPONSE);
                    expect(res.headers['location']).not.to.be.null;

                    callback(null, res.headers['location']);
                });
        },
        function(newUri, callback){
            var myData = '';

            http.get(newUri, function(res) {
                res.on('data', function (chunk) {
                    myData += chunk;
                }).on('end', function(){
                        callback(null, myData);
                    });
            }).on('error', function(e) {
                    callback(e, null);
                });
        }
    ], function (err, finalData) {
        if (err) throw err;
        myCallback(finalData);
    });

};
exports.getLatestFromChannel = getLatestFromChannel;