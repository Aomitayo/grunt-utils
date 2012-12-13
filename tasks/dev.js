/*
 * grunt-utils
 * https://github.com/adedayo/grunt-utils
 *
 * Copyright (c) 2012 Adedayo Omitayo
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {
  var fs = require('fs');
  var path = require('path');
  var buffers = require('buffers');
  // In Nodejs 0.8.0, existsSync moved from path -> fs.
  var existsSync = fs.existsSync || path.existsSync;

  var http = require('http');
  var taskEvent = new require('events').EventEmitter();

  var connect = require('connect');
  var WebSocketServer = require('websocket').server;

  var httpServer = null;
  var wsio = null;

  // Please see the grunt documentation for more information regarding task and
  // helper creation: https://github.com/gruntjs/grunt/blob/master/docs/toc.md

  // ==========================================================================
  // TASKS
  // ==========================================================================
  grunt.registerTask('dev', 'Start development server. watch for changes and reload clients or restart the server as required', function(){
    var self = this;
    self.requiresConfig('dev', 'watch.clientReload', 'watch.serverRestart');

    var options = grunt.config.get('dev');

    var taskDone = self.async();

    grunt.task.run('dev:server-restart');

    //enqueue watch task
    grunt.task.run('watch');
    taskDone();
  });

  grunt.registerTask('dev:server-restart', 'Start the dev server', function(){
    var self = this;
    self.requiresConfig('dev');
    var options = grunt.config.get('dev');
    var port = options.server.port;
    
    var taskDone = self.async();
    // Start server.
    if(!httpServer){
      httpServer = http.createServer();
      httpServer.listen(port, function(){
        grunt.log.write( 'Starting dev server on port '.yellow + String( port ).red );
        
        //.writeln( '  - ' + path.resolve(opts.base) )
        //.writeln('I\'ll also watch your files for changes, recompile if neccessary and live reload the page.')
        grunt.log.writeln('...'.yellow + 'Done'.green).writeln('Hit Ctrl+C to quit.');
        
        taskDone();
      });
    }
    else{
      grunt.log.writeln( 'Dev server is already listening '.red );
      taskDone();
    }
    if(!wsio){
      wsio = new WebSocketServer({
        httpServer: httpServer,
        autoAcceptConnections: true
      });
      wsio.on('connect', function(request){
        var connection = request; //.accept(); //.accept('*', request.origin);
        console.log((new Date()) + ' Connection accepted.');
        connection.on('message', function (message) {
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data);
                if (message.utf8Data === 'trigger') {
                    grunt.helper('trigger', grunt.config('trigger.watchFile'));
                    connection.sendUTF('Update triggered');
                }
                // LiveReload support
                if (message.utf8Data.match(/^http:\/\//)) {
                    connection.sendUTF("!!ver:1.6;");
                }
                if (message.utf8Data.match(/{.*/)) {
                    var handshake = "{ command: 'hello', protocols: [ " +
                        "'http://livereload.com/protocols/official-7', " +
                        "'http://livereload.com/protocols/2.x-origin-version-negotiation', " +
                        "'http://livereload.com/protocols/2.x-remote-control'" +
                        "], serverName: 'grunt-reload', }";
                    connection.sendUTF(handshake);
                }
            }
        });
        connection.on('close', function (reasonCode, description) {
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        });
      });
    }

    var injectionRoutes = options.client['inject-reload'] || ['.*\/index.html'];
    var injector = grunt.helper('clientReload:injector', injectionRoutes);
    var clientScript = grunt.helper('clientReload:script');
    var connectApp = connect.createServer()
      .use(injector)
      .use(clientScript);
    grunt.helper('webapps', connectApp);
    grunt.helper('statics', connectApp);
    httpServer.removeAllListeners('request');
    httpServer.on('request', function(req, res){
      connectApp(req, res);
    });

  });

  grunt.registerTask('dev:client-reload', 'Reload connected clients', function(){
    if(!wsio){
      grunt.log.writeln('Websockets Server is not active');
      return;
    }
    var path = grunt.file.watchFiles ? grunt.file.watchFiles.changed[0] : 'index.html';
    var target = '';
    // apply_js_live
    var msg = '["refresh", {"path": "' + path + '", "target": "' + target + '"}]';

    wsio.connections.forEach(function(connection){
      console.log('Sending reload');
      connection.sendUTF(msg);
    });
  });

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  /**
   * A factory for script injection middleware
   */
  grunt.registerHelper('clientReload:injector', function(routes){
    routes = routes || ['.*\/index.html'];
    
    var injector = function(req, res, next){
      var url = req.url;
      var isMatch = false;
      for(var i in routes){
        var routeRe = new RegExp(routes[i]);
        isMatch = routeRe.test(url);
        if(isMatch) break;
      }

      if(!isMatch) return next();

      var port = res.socket.server.address().port;

      var _write = res.write;
      var _end = res.end;
      var _writeHead = res.writeHead;

      var responseBuffer = new buffers();
      var html = '';
      var responseEncoding = 'utf8';
      var _headers;
      var _statusCode;
      //console.log(Object.keys(res).sort());
      res.writeHead = function(statusCode, headers){
        _writeHead.call(res, statusCode, headers);
      };

      res.write = function(data){
        responseBuffer.push(data);
      };

      res.end = function(){
        html = responseBuffer.toString().replace(/<\/body>/, function(w) {
          return [
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
        res.setHeader('content-length', html.length);
        _write.call(res, html);
        _end.call(res);
      };
      return next();
    };

    return injector;
  });

  /**
   * Factory for client script middleware
   */
  grunt.registerHelper('clientReload:script', function(){
    return function(req, res, next){
      var route = '/reload-client.js';
      if(req.url.match(route)){
        var filePath = __dirname + "/static/reload-client.js";
        fs.createReadStream(filePath).pipe(res);
      }
      else{next();}
    };
  });

  grunt.registerHelper('statics', function(connectApp){
    var map = grunt.config.get('dev.server.statics');
    Object.keys(map).forEach(function(k){
      var pattern = map[k];
      var dir = grunt.file.expandDirs(pattern)[0];
      connectApp.use(k, connect['static'](dir));
    });
  });

  grunt.registerHelper('webapps', function(connectApp){
    var map = grunt.config.get('dev.server.webApps');
    Object.keys(map).forEach(function(k){
      var pattern = map[k];
      var dir = grunt.file.expandDirs(pattern)[0];
      dir = path.resolve(dir);
      app = require(dir);
      connectApp.use(k, app);
    });
  });
};
