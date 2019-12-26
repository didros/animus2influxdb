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

//process.on('uncaughtException', function(error) {
 //  logger.error("Application exit because off uncaughtException");
 //  logger.error(error);
   // process.exit(1)
//});

var devices= new HashMap();
var functions= new HashMap();
var locations= new HashMap();

// Read locations from configuration file (can't fin APIs for that)
logger.debug("LOCATIONS = " + process.env.LOCATIONS);
const loc = JSON.parse(process.env.LOCATIONS);
for (var L in loc ) {
    if (loc.hasOwnProperty(L)) {
       locations.set(L, loc[L]);
       logger.debug(L + " -> " + locations.get(L));
    }
}


// Animushome heart stuff
const protocol = "AHauth";
const wsUri    = "ws://" + process.env.HEART_IP + "/heart/events";


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
       'name', 'location', 'unit'
     ]
   }
 ]
})


// Create the sensor object
var sensor = {name:"", location:null, temperature:null, humidity:null, presence:null, unit:null};

var ws;

function pingHeart() {
  logger.debug("Send heartbeat");
  ws.send("heartbeat");
  setTimeout(pingHeart, 50000);
}


function startWebsocket() {

logger.info("In startWebsocet");

//  Open websocket
ws = new WebSocket(wsUri, protocol);


ws.onopen = function(evt) {
  logger.info("ws open:" + JSON.stringify(evt,null,2));
  //First message after connection open must be the Authorization message
  //Send Authorization message within 2 seconds, otherwise socket will get closed
  ws.send("Authorization: Bearer " + process.env.HEART_API_KEY);
  setTimeout(pingHeart, 50000);
};

ws.onclose = function(evt) {
  logger.info("ws close", evt);
  clearTimeout();
  ws = null
  logger.info("Starting websocket in 5 s", evt);
  setTimeout(startWebsocket, 5000)
};

ws.onerror = function(evt) {
  logger.error("ws error", evt);
  clearTimeout();
};

//All events will be received by this callback function
ws.onmessage = function(evt) {
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

           var write2db = true;

 	   func = functions.get(resp.functionUID); 
    	   if (func.clazz === "com.animushome.heart.service.dal.functions.MultiLevelSensor") {
              if (func.type === "temperature") {
	         sensor.temperature = resp.value.level;
	      } 
	      else if (func.type === "humidity") {
	         sensor.humidity = resp.value.level;
	      }
	      else {
	         logger.warn("Unsupported type (" + func.type + ").");
                 write2db = false;
	      }
           }
	   else {
	      if ( func.clazz === "com.animushome.heart.service.dal.functions.BooleanSensor" ) {
	         sensor.presence = resp.value.value;
              }
              else {
	         logger.warn("Unsupported clazz (" + func.clazz + ").");
                 write2db = false;
              }
	   }

	   if ( devices.has(func.device_UID)) {
	      dev = devices.get(func.device_UID);
	      sensor.name = dev.name;
	      sensor.location = locations.get(dev.animus_area);
	   }
	   else {
	      logger.warn("Unknown device (do a restart to force reading new devices)");
              write2db = false;
	   }

	   // Write value to InfluxDB
           if ( write2db ) {
              //logger.debug("sensor object:");
              //logger.debug(JSON.stringify(sensor,null,2));
	   
              logger.info("Write to influxDB");
	      logger.debug(JSON.stringify({
    	         measurement: 'sensor',
    	         tags:   { name: sensor.name, location: sensor.location, unit: sensor.unit },
    	         fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence }
  	      }),null,2);
	      if (0) {
                 logger.debug("DO NOT Write to influxDB");
	      }
	      else {
	         influx.writePoints([
  	         {
    	            measurement: 'sensor',
    	            tags:   { name: sensor.name, location: sensor.location, unit: sensor.unit },
    	            fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence }
  	         }
	         ]);
	      }
	   } 
           else {
              logger.info("NO write to influxDB");
           }
	}
	else {
	   logger.warn("Unknown function IUD : " + resp.functionUID);
           logger.info("NO write to influxDB");
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

}


// Animushome heart stuff
function animus_init() {

   // const funcUri  = "http://" + process.env.HEART_IP + "/rest/functions";
   const http = require('http');

   var options = {
       hostname: process.env.HEART_IP,
       path: '/rest/devices',
       headers: {
           Authorization: "Bearer " + process.env.HEART_API_KEY
       }
   }
   // Read devices
   http.get(options, (resp) => {
      let data = '';
      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
         data += chunk;
      });

      // The whole response has been received.
      resp.on('end', () => {
         var resp = JSON.parse(data);
         logger.debug(JSON.stringify(resp,null,2));
         for (var dev in resp) {
            if (resp.hasOwnProperty(dev)) {
               logger.debug(dev + " -> name:" + resp[dev].properties.name + " animus_area:" + resp[dev].properties.animus_area);
               devices.set(dev,{"name": resp[dev].properties.name, "animus_area": resp[dev].properties.animus_area});
            }
         } 
         
         options.path = '/rest/functions';
         logger.debug(JSON.stringify(options,null,2));
         http.get(options, (resp) => {
            let data = '';
            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
               data += chunk;
            });
            
            // The whole response has been received.
            resp.on('end', () => {
               resp = JSON.parse(data);
               logger.debug(JSON.stringify(resp,null,2));
               for (var func in resp) {
                  if (resp.hasOwnProperty(func)) {
                     functions.set(func, { "device_UID": resp[func].serviceProperties.device_UID, 
                                           "type":       resp[func].serviceProperties.type,
                                           "clazz":      resp[func].serviceProperties.clazz});
                     logger.debug(func + " -> " + JSON.stringify(functions.get(func),null,2));
                  }
               } 
            });

         }).on("error", (err) => {
            logger.error(err.message);
         });

      });
  }).on("error", (err) => {
       logger.error(err.message);
  });

    
}

animus_init();

startWebsocket();



