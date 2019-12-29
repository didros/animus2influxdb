# animus2influxdb
This program exports sensor information from Animushome Heart and push it in an InfluxDB (version 1.7), so it can be shown in Grafana for instance.

Current version supports sensors of type temperature, humudity ("MultiLevelSensor") and presence ("BooleanSensor"). Additional types can be easily supported. Program uses Heart websocket so information is received in real time (no pooling).

# Prereq

## Node and pm2
You need node.js (https://nodejs.org) to run the program. 
Optionaly, use pm2 when to are ready to go live in "production" to manage the process (unless you want to do it another way).

## InfluxDB 1.7
You need an influxDB version 1.7 to write data to. Nb! version 2.0 is not supported. InfluxDB does not need to run on the same machine than Node.js. 
I used docker to come up to speed fast. Install docker and run this command:

<code>docker run -p 8086:8086 -v influxdb:/var/lib/influxdb influxdb</code>

Create a database, named "heart" for instance. Make sure you use the this name in the configuration file .env later on. Have a look here for more info on how to use influxdb https://hub.docker.com/_/influxdb

## Grafana
If you easily want to have a graphical representation of your sensor datas, go for Grafana.

<code>docker run -d -p 3000:3000 grafana/grafana</code>

If you run Influxdb and Grafana in docker on the same server, use the local docker address when creating the Influxdb data source, e.g. http://172.17.0.5:8086.

# Install

Get a local copy of this repo.

# Configuration

Edit and configure the file .env.

## If runing in docker
Create the image.

<code>sudo docker image build -t animus2influxdb:0.9 .</code>

# Run


## Run (no container)

Interactive mode:
<code>npm start</code>

or 

<code>node ./js-animus.js</code>

Using pm2 to demonize you process

<code>pm2 start 0</code>

## Run in docker

Config file in the container:

<code>sudo docker container run --detach -i --name animus animus2influxdb:0.9</code>

