var fs = require('fs');
var path = require('path');
var buffers = require('buffers');

var http = require('http');
var connect = require('connect');
var engineio = require('engine.io');

var wsio;

function startDevServer(options){
  var injectionRoutes = options.clientReload || ['.*\/index.html'];
  var injector = makeInjector(injectionRoutes);
  var connectApp = connect.createServer()
    .use(injector)
    .use(clientReloadScript)
    .use('/engine.io.js', engineIOClient);

  loadStatics(options.statics, connectApp);
  loadWebapps(options.webApps, connectApp);

  var httpServer = http.createServer();
  httpServer.on('request', function(req, res){
    connectApp(req, res);
  });
  wsio = engineio.attach(httpServer, {
    //path:'/engine.io',
    resource: 'clientreload',
    transports:['websocket', 'polling', 'flashsocket']
  });
  configureWSIO(wsio);
  loadRealtimeapps(options.realtimeApps, httpServer);

  httpServer.listen(options.port, function(){
    process.send('server-started');
  });
}


function configureWSIO(wsio){
  wsio.on('connection', function(connection){
    
    console.log((new Date()) + ' Reload Client Connected.');

    connection.on('message', function (message) {
      console.log('Recieved message', message);
        // if (message.type === 'utf8') {
        //     console.log('Received Message: ' + message.utf8Data);
        //     if (message.utf8Data === 'trigger') {
        //         grunt.helper('trigger', grunt.config('trigger.watchFile'));
        //         connection.sendUTF('Update triggered');
        //     }
        //     // LiveReload support
        //     if (message.utf8Data.match(/^http:\/\//)) {
        //         connection.sendUTF("!!ver:1.6;");
        //     }
        //     if (message.utf8Data.match(/{.*/)) {
        //         var handshake = "{ command: 'hello', protocols: [ " +
        //             "'http://livereload.com/protocols/official-7', " +
        //             "'http://livereload.com/protocols/2.x-origin-version-negotiation', " +
        //             "'http://livereload.com/protocols/2.x-remote-control'" +
        //             "], serverName: 'grunt-reload', }";
        //         connection.sendUTF(handshake);
        //     }
        // }
    });
    connection.on('close', function (reasonCode, description) {
        console.log((new Date()) + ' Reload Client disconnected: ', reasonCode, description);
    });
  });
}

function clientReloadScript(req, res, next){
  var route = '/reload-client.js';
  if(req.url.match(route)){
    var filePath = __dirname + "/reload-client.js";
    fs.createReadStream(filePath).pipe(res);
  }
  else{next();}
}

function engineIOClient(req, res, next){
  var filePath = path.dirname(require.resolve('engine.io-client'));
  filePath = path.join(filePath, '../dist', 'engine.io.js');
  console.log(filePath);
  fs.createReadStream(filePath).pipe(res);
}

function makeInjector(routes){
  routes = routes || ['.*\/index.html'];
  
  var injector = function(req, res, next){
    //return next();
    var url = req.url;
    var isMatch = false;
    for(var i in routes){
      var routeRe = new RegExp(routes[i]);
      isMatch = routeRe.test(url);
      if(isMatch) break;
    }

    if(!isMatch){
      return next();
    }

    console.log('Injecting clientReload Script into', req.url);

    var port = res.socket.server.address().port;

    var _write = res.socket.write;
    var _end = res.end;

    var responseBuffer = new buffers();
    var responseEncoding = 'utf8';

    res.socket.write = function(chunk, encoding){
      var chunkBuffer = chunk;
      if(chunkBuffer && typeof chunkBuffer === 'string'){
        chunkBuffer = new Buffer(chunkBuffer, encoding);
      }
      responseBuffer.push(chunkBuffer);
    };
    
    res.end = function(chunk, encoding){
      if(chunk){
        res.write(chunk, encoding);
      }
      originalResponse = responseBuffer.toString();
      var response = originalResponse.replace(/<\/body>/, function(w) {
        return [
          "<!-- engineio script -->\n",
          '<script src="/engine.io.js" type="text/javascript"></script>\n',
          "<!-- reload snippet -->\n",
          "<script>\n",
          "var markup = ",
          "'<script src=\"http://' + (location.host || 'localhost').split(':')[0]",
          " + ':" + port + "\\/reload-client.js\"><\\/script>'",
          ";\n",
          "document.write(markup)\n",
          "</script>\n",
          "\n",
          w
        ].join('');
      });
      response = response.replace(/Content-Length:\s*\d+/i, function(w){
        //'Content-Length: '+ response.length
        var length = parseInt(w.split(':')[1], 10);
        length += response.length - originalResponse.length;
        return 'Content-Length: ' + length;
      });
      
      res.socket.write = _write;
      res.socket.write(response);
      _end.call(res);
    };
    return next();
  };

  return injector;
}

function loadStatics(map, connectApp){
  Object.keys(map).forEach(function(k){
    var dir = map[k];
    dir = path.resolve(dir);
    connectApp.use(k, connect['static'](dir));
  });
}

function loadWebapps(map, connectApp){
  Object.keys(map).forEach(function(k){
    var dir = map[k];
    dir = path.resolve(dir);
    var app = require(dir);
    connectApp.use(k, app);
  });
}

function loadRealtimeapps(map, httpServer){
  Object.keys(map).forEach(function(k){
    var dir = map[k];
    dir = path.resolve(dir);
    var app = require(dir);
    app.attach(httpServer);
  });
}

process.on('message', function(options){
  if(options == 'reload-clients'){
    (Object.keys(wsio.clients) || []).forEach(function(clientId){
      wsio.clients[clientId].send('Reload');
    });
    process.send('clients-reloaded');
  }
  else{
    startDevServer(options);
  }
});
