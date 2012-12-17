/*
 * grunt-utils
 * https://github.com/adedayo/grunt-utils
 *
 * Copyright (c) 2012 Adedayo Omitayo
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {
  var fork = require('child_process').fork;
  var serverProcess = null;
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

    grunt.task.run('dev:server-start');

    //enqueue watch task
    grunt.task.run('watch');
    taskDone();
  });

  grunt.registerTask('dev:server-start', 'Start the dev server', function(){
    var self = this;
    self.requiresConfig('dev.server', 'dev.server.port');
    
    var taskDone = this.async();

    var options = grunt.config.get('dev.server');

    grunt.log.write( 'Starting dev server on port '.yellow + String( options.port ).blue + '...' );
    serverProcess = fork(__dirname + '/lib/dev-server.js', [], {
      cwd: process.cwd(),
      env: process.env
    });

    serverProcess.on('message', function(m){
      if(m === 'server-started'){
        grunt.log.writeln('Done'.green);
      }
      else if(m === 'start-failed'){
        grunt.fail.warn('Failed'.red );
        //grunt.fail.warn('Server Did not start')
      }
      taskDone();
    });

    serverProcess.send(options);
  });

  grunt.registerTask('dev:server-stop', 'Stop the dev server', function(){
    var taskDone = this.async();
    if(serverProcess){
      grunt.log.write( 'Stopping dev server ...'.yellow );
      serverProcess.once('exit', function(){
        grunt.log.writeln( 'Done '.green );
        taskDone();
      });
      serverProcess.kill();
    }
    else{
      grunt.log.writeln( 'Http Server is not running'.yellow );
      taskDone();
    }
  });
};
