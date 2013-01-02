var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var existsSync = fs.existsSync || path.existsSync;

module.exports = function(grunt){

	grunt.registerMultiTask('buildout', 'Stages projects files, builds them and packages for distribution', function(){
		var self = this,
			stagingdir = grunt.option('stagingdir') || grunt.config.get('stagingdir'),
			distdir = grunt.option('distdir') || grunt.config.get('distdir');
		
		if(!stagingdir){
			grunt.fail.warn('A Staging directory must be specified');
		}
		else{
			grunt.config.set('stagingdir', path.resolve(stagingdir) );
		}

		if(!distdir){
			grunt.fail.warn('A Dist directory must be specified');
		}
		else{
			grunt.config.set('distdir', path.resolve(distdir) );
		}

		var target = this.target;

		//run sub tasks
		var taskList =  self.data.tasks;
		taskList = typeof taskList === 'string'? taskList.split() : (taskList || []);
		taskList = Array.isArray(taskList)? taskList : [taskList];
		taskList.unshift('buildout:stage:'+target);
		taskList.push('buildout:dist:'+target);
		//package for distribution
		grunt.task.run(taskList);
	});

	grunt.registerTask('buildout:stage', 'stages files', function(){
		var target = grunt.config.escape(this.args[0]);
		this.requiresConfig('stagingdir', 'buildout.' + target + '.staging');
		var stagingdir = grunt.config.get('stagingdir');
		
		grunt.log.write(('Staging files for ' + target + '...').cyan);

		grunt.file.mkdir(stagingdir);
		grunt.config.get('buildout.' + target + '.staging').forEach(function(spec){
			grunt.helper('buildout:copy', spec, process.cwd(), stagingdir);
		});
		
		grunt.log.ok();
	});

	grunt.registerTask('buildout:dist', 'packages for distribution', function(){
		var target = grunt.config.escape(this.args[0]);
		this.requiresConfig('stagingdir', 'distdir', 'buildout.' + target + '.dist');
		var stagingdir = grunt.config.get('stagingdir'),
			distdir = grunt.config.get('distdir');
		grunt.log.write('Collecting Dist files...'.cyan);
		grunt.file.mkdir(distdir);
		grunt.config.get('buildout.' + target + '.dist').forEach(function(spec){
			grunt.helper('buildout:copy', spec, stagingdir, distdir);
		});
		grunt.log.ok();
	});

	/**
	 * Copies files from a source path to a destination based on a spec
	 */
	grunt.registerHelper('buildout:copy', function(spec, srcBase, destBase){
		var self = this,
			originalDir = process.cwd();

		srcBase = path.resolve(srcBase);
		grunt.file.setBase(srcBase);
		destBase = path.resolve(destBase);

		var dest = spec.dest,
			destType =  grunt.utils._.endsWith(dest, path.sep)? 'directory' : 'file',
			isDestAbsolute = /^\//.test(dest);
		dest = isDestAbsolute? dest : path.resolve(destBase, dest);

		//Expand source files
		var files = grunt.file.expandFiles(spec.src);
		
		if(files.length === 0) {
			grunt.fail.warn('Unable to copy; no valid source files were found.');
			return done();
		}

		if(destType === 'file' && files.length !== 1){
			grunt.fail.warn('Unable to copy multiple files to the same destination filename, did you forget a trailing slash?');
			return done();
		}
		
		if(destType === 'directory' || (destType === 'file' && files.length === 1) ){
			var anchorPath = spec.anchorPath? path.resolve(spec.anchorPath) : null;
			//grunt.verbose.write('Cleaning ' + dest);
			//grunt.helper('buildout:rimraf', dest);
			files.forEach(function(srcFile){
				if(spec.ignore && grunt.file.isMatch(spec.ignore, srcFile)){
					return;
				}

				var rPath = anchorPath? path.relative(anchorPath, srcFile) : path.basename(srcFile);
				destFile = path.join(dest,  rPath);
				//console.log('srcFile %s \n anchorPath %s \nrpath %s \ndestFile %s', srcFile, anchorPath, rPath, destFile);
				//grunt.verbose.or.write('Copying from ' + srcFile.cyan + '...\n');
				//grunt.log.write('Copying file to ' + destFile.cyan + '...');
				grunt.file.copy(srcFile, destFile);
			});
			return done();
		}

		function done(){
			//restoring base
			grunt.file.setBase(originalDir);
		}
	});

	grunt.registerHelper('buildout:cleandir', function(dir){
		if(existsSync(dir)){
			grunt.helper('buildout:rimraf', dir);
		}
	});

	grunt.registerHelper('buildout:rimraf', function(dir, taskDone) {
	if(typeof taskDone !== 'function') return rimraf.sync(dir);
	rimraf(dir, taskDone);
  });
};