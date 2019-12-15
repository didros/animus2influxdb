#!/usr/bin/node

// Dependencies
require('dotenv').config()
const Influx = require('influx');
const WebSocket = require('ws');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  //format: winston.format.json(),
  format: winston.format.simple(),
  defaultMeta: { },
  transports: [
    //
    // - Write to all logs with level `debug` and below to `/tmp/log-heart2info.log'
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: '/tmp/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/tmp/log-heart2info.log' })
  ]
});


//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.cli()
  }));
  logger.info("Not production");
}

process.on('uncaughtException', function(error) {
   logger.error("Application exit because off uncaughtException");
   logger.error(error);
   process.exit(1)
});


// Init Animushome heart stuff
const wsUri = "ws://" + process.env.HEART_IP + "/heart/events";
const protocol = "AHauth";
var websocket = new WebSocket(wsUri, protocol);


// Influx DB
const influx = new Influx.InfluxDB({
 host: process.env.INFDB_IP,
 database: process.env.INFDB_NAME,
 schema: [
   {
     measurement: 'sensor',
     fields: {
       temperature: Influx.FieldType.FLOAT,
       humidity: Influx.FieldType.INTEGER,
       presence: Influx.FieldType.BOOLEAN
     },
     tags: [
       'name', 'location'
     ]
   }
 ]
})

// Create the sensor object
var sensor = {name:"", location:null, temperature:null, humidity:null, presence:null};


function myPing() {
  logger.debug("Send heartbeat");
  websocket.send("heartbeat");
  setTimeout(myPing, 50000);
}

websocket.onopen = function(evt) {
  // THIS IS NOT working logger.info("ws open", evt);
  logger.info("ws open");
  logger.info(JSON.stringify(evt,null,2));
  //First message after connection open must be the Authorization message
  //Send Authorization message within 2 seconds, otherwise socket will get closed
  websocket.send("Authorization: Bearer " + process.env.HEART_API_KEY);
  setTimeout(myPing, 50000);
};

websocket.onclose = function(evt) {
  logger.debug("ws close", evt);
};

websocket.onerror = function(evt) {
  logger.error("ws error", evt);
};

//All events will be received by this callback function
websocket.onmessage = function(evt) {

  logger.info(evt.data);

  try {
        var resp = JSON.parse(evt.data);

        logger.info("Measure from animus:");
        logger.info("functionUID:  " + resp.functionUID);
        logger.info("level:        " + resp.value.level);
        logger.info("unit:         " + resp.value.unit);
        logger.info("timestamp:    " + resp.value.timestamp);
        var ts = new Date(resp.value.timestamp);
        logger.info("timestamp:    " + ts.toGMTString());
	
	var value  = resp.value.level;
	sensor.temperature = null;
	sensor.humidity    = null;
	sensor.presence    = null;

	// Fibaro smoke detector
	if (resp.functionUID.match(/f-0\.49\.1$/) ){ 
	   sensor.name = "Smoke detector";
	   sensor.location = "Couloir";
	   sensor.temperature = value;
	}

	// Tellus thermo & hygro
	if (resp.functionUID.match(/f-8193\.0$/) ) { 
	   sensor.name = "Tellus"
	   sensor.location = "Bureau"
	   sensor.temperature = value;
	}

	if (resp.functionUID.match(/f-8193\.1$/) ) { 
	   sensor.name = "Tellus"
	   sensor.location = "Bureau"
	   sensor.humidity = value;
	}

    	// Everspring presence sensor
	if (resp.functionUID.match(/f-0\.48$/) )   { 
	   sensor.name = "Everspring"
	   sensor.location = "Couloir"
	   sensor.presence = resp.value.value;
	   if (resp.value.value) {
	      value=1;
	   }
	   else {
	      value=0;
	   }
        }

        logger.debug("sensor object:");
        logger.debug(JSON.stringify(sensor,null,2));
	// Write value to InfluxDB
        if ( (sensor.temperature != null) || (sensor.humidity != null) || (sensor.presence != null) ) {
           logger.info("Write to influxDB");
	   influx.writePoints([
  	      {
    	         measurement: 'sensor',
    	         tags: { name: sensor.name, location: sensor.location },
    	         fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence }
  	      }
	   ]);
	}
  }
  catch(err) {
     // Ignore
     if ( err.name === 'SyntaxError' ) {
	logger.warn("Not JSON format: expected, nothing to worry about");
     } else {
	logger.error(err);
     }
  }


};



