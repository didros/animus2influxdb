# animus2influxdb
This program exports sensor information from Animushome Heart and push it in an InfluxDB (version 1.7), so it can be shown in Grafana for instance. 

Current version supports sensors of type temperature, humudity and presence ("booleansensor"). Additional types can be easily supported. Program uses Heart websocket so information is received in real time (no poooling).

# Prereq

## Node

## InfluxDB 1.7
You need an influxDB version 1.7 to write data to. Nb! version 2.0 is not supported. 
I used docker to come up to speed fast. Install docker and run this command:

<code>docker run -p 8086:8086 -v influxdb:/var/lib/influxdb influxdb</code>

Have a look here for more info https://hub.docker.com/_/influxdb

## Grafana


# Install

# Configuration

# Run
