var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'Xeggex Arbitrage Servoce',
  description: 'Xeggex Arbitrage Servoce',
  script: __dirname + '/main.js'
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

svc.install();