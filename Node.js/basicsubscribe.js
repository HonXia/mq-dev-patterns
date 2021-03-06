/**
 * Copyright 2019 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/


// This is a demonstration showing the basic subscribe operations onto a MQ Topic
// Using the MQI Node.js interface

// This application is based on the samples
// https://github.com/ibm-messaging/mq-mqi-nodejs/blob/master/samples/amqsconn.js
// and
// https://github.com/ibm-messaging/mq-mqi-nodejs/blob/master/samples/amqssub.js
//
// Values for Queue Manager, Topic, Host, Port and Channel are
// passed in as envrionment variables.
// Import the MQ package
var mq = require('ibmmq');
// Import any other packages needed
var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

// Load up missing envrionment variables from the .env settings file.
require('dotenv').load();

var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// Set up debug logging options
var debug_info = require('debug')('amqssub:info');
var debug_warn = require('debug')('amqssub:warn');

var MQDetails = {
  QMGR: process.env.QMGR,
  TOPIC_NAME: process.env.TOPIC_NAME,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  CHANNEL: process.env.CHANNEL,
  KEY_REPOSITORY: process.env.KEY_REPOSITORY,
  CIPHER: process.env.CIPHER
}

var credentials = {
  USER: process.env.APP_USER,
  PASSWORD: process.env.APP_PASSWORD
}

// Global variables
var ok = true;

// Define some functions that will be used from the main flow
function getMessages(hObj) {
  while (ok) {
    getMessage(hObj);
  }
}

// This function retrieves messages from the queue without waiting using
// the synchronous method for simplicity. See amqsgeta for how to use the
// async method.
function getMessage(hObj) {

  var buf = Buffer.alloc(1024);

  var mqmd = new mq.MQMD();
  var gmo = new mq.MQGMO();

  //gmo.WaitInterval = 3 * 1000; // 3 seconds
  gmo.WaitInterval = 30 * 1000; // 30 seconds
  gmo.Options = MQC.MQGMO_NO_SYNCPOINT |
    MQC.MQGMO_WAIT |
    MQC.MQGMO_CONVERT |
    MQC.MQGMO_FAIL_IF_QUIESCING;

  mq.GetSync(hObj, mqmd, gmo, buf, function(err, len) {
    if (err) {
      if (err.mqrc == MQC.MQRC_NO_MSG_AVAILABLE) {
        debug_info("no more messages");
      } else {
        debug_warn("MQGET failed with " + err.mqrc);
      }
      ok = false;
    } else if (mqmd.Format == "MQSTR") {
      var msgObject = null;
      try {
        msgObject = JSON.parse(buf);
        debug_info("Message Object found", msgObject);
      } catch (err) {
        debug_info("message <%s>", decoder.write(buf));
      }
    } else {
      debug_info("binary message: " + buf);
    }
  });
}

// When we're done, close queues and connections
function cleanup(hConn, hObjPubQ, hObjSubscription) {
  // Demonstrate two ways of closing queues - first using an exception, then
  // the version with callback.
  try {
    mq.Close(hObjSubscription, 0);
    debug_info("MQCLOSE (Subscription) successful");
  } catch (err) {
    debug_warn("MQCLOSE (Subscription) ended with reason " + err.mqrc);
  }

  mq.Close(hObjPubQ, 0, function(err) {
    if (err) {
      debug_warn("MQCLOSE (PubQ) ended with reason " + err.mqrc);
    } else {
      debug_info("MQCLOSE (PubQ) successful");
    }
    mq.Disc(hConn, function(err) {
      if (err) {
        debug_warn("MQDISC ended with reason " + err.mqrc);
      } else {
        debug_info("MQDISC successful");
      }
    });
  });
}

// The program really starts here.
// Connect to the queue manager. If that works, the callback function
// opens the topic, and then we can start to retrieve messages.

debug_info("Sample AMQSSUB.JS start");

var cno = new mq.MQCNO();
// use MQCNO_CLIENT_BINDING to connect as client
// cno.Options = MQC.MQCNO_NONE;
cno.Options = MQC.MQCNO_CLIENT_BINDING;

// For no authentication, disable this block
if (credentials.USER) {
  var csp = new mq.MQCSP();
  csp.UserId = credentials.USER;
  csp.Password = credentials.PASSWORD;
  cno.SecurityParms = csp;
}

// And then fill in relevant fields for the MQCD
var cd = new mq.MQCD();
cd.ConnectionName = `${MQDetails.HOST}(${MQDetails.PORT})`;
cd.ChannelName = MQDetails.CHANNEL;

if (MQDetails.KEY_REPOSITORY) {
  debug_info('Will be running in TLS Mode');
  // *** For TLS ***
  var sco = new mq.MQSCO();

  cd.SSLCipherSpec = MQDetails.CIPHER;
  cd.SSLClientAuth = MQC.MQSCA_OPTIONAL;

  sco.KeyRepository = MQDetails.KEY_REPOSITORY;
  // And make the CNO refer to the SSL Connection Options
  cno.SSLConfig = sco;
}

// Make the MQCNO refer to the MQCD
cno.ClientConn = cd;

// Do the connect, including a callback function
mq.Connx(MQDetails.QMGR, cno, function(err, hConn) {
  if (err) {
    console.log("MQCONN ended with reason code " + err.mqrc);
  } else {
    console.log("MQCONN to %s successful ", MQDetails.QMGR);

    // Define what we want to open, and how we want to open it.
    var sd = new mq.MQSD();
    sd.ObjectString = MQDetails.TOPIC_NAME;
    sd.Options = MQC.MQSO_CREATE |
      MQC.MQSO_NON_DURABLE |
      MQC.MQSO_FAIL_IF_QUIESCING |
      MQC.MQSO_MANAGED;

    mq.Sub(hConn, null, sd, function(err, hObjPubQ, hObjSubscription) {
      if (err) {
        debug_warn("MQSUB ended with reason " + err.mqrc);
      } else {
        debug_info("MQSUB to topic %s successful", MQDetails.TOPIC_NAME);
        // And loop getting messages until done.
        getMessages(hObjPubQ);
      }
      cleanup(hConn, hObjPubQ, hObjSubscription);
    });
  }
});
