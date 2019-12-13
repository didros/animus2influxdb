#!/usr/bin/node

require('dotenv').config()

console.log("Running in :"  + process.env.API_KEY_JEEDOM);
console.log("Running in :"  + process.env.API_KEY_ANIMUS);

process.exit(1);

process.on('uncaughtException', function(error) {
   console.log(error);
   process.exit(1)
});


// Jeedom stuff
const http = require('http');
const Jeedom_url  = 'http://192.168.1.112/core/api/jeeApi.php?plugin=virtual&apikey="+process.env.API_KEY_JEEDOM+"&type=virtual';
const id_fibtemp = 1559

// Animus stuff
const WebSocket = require('ws');
var wsUri = "ws://192.168.1.138/heart/events";
var protocol = "AHauth";
var websocket = new WebSocket(wsUri, protocol);


// Influx DB
const Influx = require('influx');
const influx = new Influx.InfluxDB({
 host: '192.168.1.103',
 database: 'didtest',
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
var sensor = {jeedomcmd:0, name:"", location:null, temperature:null, humidity:null, presence:null};


function do_log(msg) {
   console.log(msg);
}

function myPing() {
  console.log(`.`);
  websocket.send("heartbeat");
  setTimeout(myPing, 50000);
}

websocket.onopen = function(evt) {
  console.debug("ws open", evt);
  //First message after connection open must be the Authorization message
  //Send Authorization message within 2 seconds, otherwise socket will get closed
  websocket.send("Authorization: Bearer " + process.env.API_KEY_ANIMUS);
  setTimeout(myPing, 50000);
};

websocket.onclose = function(evt) {
  console.debug("ws close", evt);
};

websocket.onerror = function(evt) {
  console.error("ws error", evt);
};

//All events will be received by this callback function
websocket.onmessage = function(evt) {

  console.log(evt.data);

  try {
        var resp = JSON.parse(evt.data);

        console.log("Measure from animus:");
        console.log("functionUID:  " + resp.functionUID);
        console.log("level:        " + resp.value.level);
        console.log("unit:         " + resp.value.unit);
        console.log("timestamp:    " + resp.value.timestamp);
        var ts = new Date(resp.value.timestamp);
        console.log("timestamp:    " + ts.toGMTString());
	
	var value  = resp.value.level;
	sensor.jeedomcmd   = null;
	sensor.temperature = null;
	sensor.humidity    = null;
	sensor.presence    = null;

	// Fibaro smoke detector
	if (resp.functionUID.match(/f-0\.49\.1$/) ){ 
	   sensor.jeedomcmd = 1559;
	   sensor.name = "Smoke detector";
	   sensor.location = "Couloir";
	   sensor.temperature = value;
	}

	// Tellus thermo & hygro
	if (resp.functionUID.match(/f-8193\.0$/) ) { 
	   sensor.jeedomcmd = 1560; 
	   sensor.name = "Tellus"
	   sensor.location = "Bureau"
	   sensor.temperature = value;
	}

	if (resp.functionUID.match(/f-8193\.1$/) ) { 
	   sensor.jeedomcmd = 1561; 
	   sensor.name = "Tellus"
	   sensor.location = "Bureau"
	   sensor.humidity = value;
	}

    	// Everspring presence sensor
	if (resp.functionUID.match(/f-0\.48$/) )   { 
	   sensor.jeedomcmd = 1562; 
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

        console.log("sensor object:");
	console.log(sensor);
	// Write value to InfluxDB
        if ( (sensor.temperature != null) || (sensor.humidity != null) || (sensor.presence != null) ) {
           console.log("Write to influxDB");
	   influx.writePoints([
  	      {
    	         measurement: 'sensor',
    	         tags: { name: sensor.name, location: sensor.location },
    	         fields: { temperature: sensor.temperature, humidity: sensor.humidity, presence: sensor.presence }
  	      }
	   ]);
	}

        // Write value to Jeedom
        if (sensor.jeedomcmd > 0) {
           http.get(Jeedom_url + "&id=" + sensor.jeedomcmd + "&value=" + value, (resp) => {

              let data = '';

              // A chunk of data has been recieved.
              resp.on('data', (chunk) => {
                 data += chunk;
              });

              // The whole response has been received. Print out the result.
              resp.on('end', () => {
                 do_log(data);
                 do_log("Update Jeedom looks good (value="+value+")!");
              });

           }).on("error", (err) => {
              do_log("Error update Jeedom: " + err.message);
           });
        }
  }
  catch(err) {
     // Ignore
     if ( err.name === 'SyntaxError' ) {
	do_log("Not JSON format: expected, nothing to worry about");
     } else {
	do_log(err);
     }
  }


};



