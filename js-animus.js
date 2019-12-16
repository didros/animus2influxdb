#!/usr/bin/node

// Dependencies
var HashMap = require('hashmap');
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
    // DEBUG new winston.transports.File({ filename: '/tmp/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/tmp/log-heart.log' })
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

var devices= new HashMap();
var functions= new HashMap();
var locations= new HashMap();

locations.set("area-0-1575580173183", "Couloir");
locations.set("area-8-1575149704169", "Bureau");

devices.set("com.animushome.heart.packages.rf433.1d16ea82-9ce4-4e30-af75-80415e0c30d3",{"name":"Tellus", "animus_area": "area-8-1575149704169"});
devices.set("com.animushome.heart.packages.zwave.devices.010F-6",{"name":"Detecteur fumée","animus_area":"area-0-1575580173183"});
devices.set("com.animushome.heart.packages.zwave.devices.0060-8",{"name":"Motion couloir","animus_area":"area-0-1575580173183"});

functions.set("com.animushome.heart.packages.rf433.1d16ea82-9ce4-4e30-af75-80415e0c30d3:f-8193.0", {"device_UID": "com.animushome.heart.packages.rf433.1d16ea82-9ce4-4e30-af75-80415e0c30d3", "type": "temperature", "clazz": "com.animushome.heart.service.dal.functions.MultiLevelSensor"});
functions.set("com.animushome.heart.packages.rf433.1d16ea82-9ce4-4e30-af75-80415e0c30d3:f-8193.1", {"device_UID": "com.animushome.heart.packages.rf433.1d16ea82-9ce4-4e30-af75-80415e0c30d3", "type": "humidity", "clazz": "com.animushome.heart.service.dal.functions.MultiLevelSensor"});
functions.set("com.animushome.heart.packages.zwave.devices.010F-6:f-0.49.1", {"device_UID": "com.animushome.heart.packages.zwave.devices.010F-6:f-0.49.1", "type": "temperature", "clazz": "com.animushome.heart.service.dal.functions.MultiLevelSensor"});
functions.set("com.animushome.heart.packages.zwave.devices.0060-8:f-0.48", {"device_UID": "com.animushome.heart.packages.zwave.devices.0060-8", "type": null, "clazz": "com.animushome.heart.service.dal.functions.BooleanSensor"});

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
       presence: Influx.FieldType.BOOLEAN,
       unit: Influx.FieldType.STRING
     },
     tags: [
       'name', 'location'
     ]
   }
 ]
})

// Create the sensor object
var sensor = {name:"", location:null, temperature:null, humidity:null, presence:null, unit:null};


function pingHeart() {
  logger.debug("Send heartbeat");
  websocket.send("heartbeat");
  setTimeout(pingHeart, 50000);
}

websocket.onopen = function(evt) {
  logger.info("ws open:" + JSON.stringify(evt,null,2));
  //First message after connection open must be the Authorization message
  //Send Authorization message within 2 seconds, otherwise socket will get closed
  websocket.send("Authorization: Bearer " + process.env.HEART_API_KEY);
  setTimeout(pingHeart, 50000);
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
	
	sensor.temperature = null;
	sensor.humidity    = null;
	sensor.presence    = null;
	sensor.unit        = resp.value.unit;

	var func, dev;
	if (functions.has(resp.functionUID)) {

 	   func = functions.get(resp.functionUID); 
    	   if (func.clazz === "com.animushome.heart.service.dal.functions.MultiLevelSensor") {
              if (func.type === "temperature") {
	         sensor.temperature = resp.value.level;
	      } 
	      else if (func.type === "humidity") {
	         sensor.humidity = resp.value.level;
	      }
	      else {
	         logger.warn("Humm... unsupported type (" + func.type + "). We should not be here");
	      }
           }
	   else {
	      // loc.class === "com.animushome.heart.service.dal.functions.BooleanSensor"
	      sensor.presence = resp.value.value;
	   }
	   if (devices.has(func.device_UID)) {
	      dev = devices.get(func.device_UID);
	      sensor.name = dev.name;
	      sensor.location = locations.get(dev.animus_area);
	   }
	   else {
	      logger.warn("Unsupported device (do a restart to force reading of devices)");
	   }
	} 
	else {
	   logger.warn("Unknown function IUD : " + resp.functionUID);
	}


        logger.debug("sensor object:");
        logger.debug(JSON.stringify(sensor,null,2));
	// Write value to InfluxDB
        if ( (sensor.temperature != null) || (sensor.humidity != null) || (sensor.presence != null) ) {
           logger.info("Write to influxDB");
           logger.debug("DO NOT Write to influxDB");
	   if (1) {
	      logger.debug("Write this to influxDB");
	      logger.debug(JSON.stringify({
    	            measurement: 'sensor',
    	            tags: { name: sensor.name, location: sensor.location },
    	               fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence, unit: sensor.unit }
  	         }),null,2);
	   }
	   else {
	      influx.writePoints([
  	      {
    	         measurement: 'sensor',
    	         tags: { name: sensor.name, location: sensor.location },
    	         fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence, unit: sensor.unit }
  	      }
	      ]);
	   }
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



