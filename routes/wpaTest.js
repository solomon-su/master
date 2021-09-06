const confF = require('./wpaConf.js')

let conf = new confF();

conf.setValue( network.ssid , "ROCK_123" );
conf.save();