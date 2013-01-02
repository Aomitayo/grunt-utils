
/**
 * Adapted from node-build script
 */

var fs = require('fs'),
  path = require('path');

//
// ### Usemin Task
//
// Replaces references ton non-optimized scripts / stylesheets into a
// set of html files (or any template / views).
//
// The replacement is based on the filename parsed from
// content and the files present in a specified dir (eg. looking up
// matching revved filename into `intermediate/` dir to know the sha
// generated).
//
// Todo: Use a file dictionary during build process and rev task to
// store each optimized assets and their associated sha1.
//
// Thx to @krzychukula for the new, super handy replace helper.
//

module.exports = function(grunt) {

  var linefeed = grunt.utils.linefeed;

  grunt.registerMultiTask('usemin', 'Replaces references to non-minified scripts / stylesheets', function() {
    var taskData = this.data;
    Object.keys(taskData).forEach(function(ext){
      var filePatterns = taskData[ext],
        files = grunt.file.expand(filePatterns);

      files.map(grunt.file.read).forEach(function(content, i) {
        var filePath = files[i];

        grunt.log.subhead('usemin - ' + filePath);

        // make sure to convert back into utf8, `file.read` when used as a
        // forEach handler will take additional arguments, and thus trigger the
        // raw buffer read
        content = content.toString();

        // ext-specific directives handling and replacement of blocks
        if(!!grunt.task._helpers['usemin:' + ext + ':blks']) {
          content = grunt.helper('usemin:' + ext + ':blks', content);
        }
        // actual replacement of revved assets
        if(!!grunt.task._helpers['usemin:' + ext + ':revved']){
          content = grunt.helper('usemin:' + ext + ':revved' + ext, content);
        }
        // write the new content to disk
        grunt.file.write(filePath, content);
      });
    });

  });

  // usemin:*:blk are used to preprocess files with the blocks and directives
  // before going through the global replace
  grunt.registerHelper('usemin:html:blks', function(content) {
    // XXX extension-specific for get blocks too.
    //
    // Eg. for each predefined extensions directives may vary. eg <!--
    // directive --> for html, /** directive **/ for css
    var blocks = grunt.helper('usemin:getblocks:html', content);

    // handle blocks
    Object.keys(blocks).forEach(function(key) {
      var block = blocks[key].join(linefeed),
        parts = key.split(':'),
        type = parts[0],
        target = parts[1] || 'replace';

      //content = grunt.helper('usemin', content, block, target, type);
      //
      content = grunt.helper('usemin:html:blk:' + type, content, block, target);
    });

    return content;
  });

  grunt.registerHelper('usemin:html:blk:css', function(content, block, target) {
    var indent = (block.split(linefeed)[0].match(/^\s*/) || [])[0];
    return content.replace(block, indent + '<link rel="stylesheet" href="' + target + '">');
  });

  grunt.registerHelper('usemin:html:blk:js', function(content, block, target) {
    var indent = (block.split(linefeed)[0].match(/^\s*/) || [])[0];
    return content.replace(block, indent + '<script src="' + target + '"></script>');
  });

  // usemin:*:revved are the global replace handlers, they delegate the regexp
  // replace to the replace helper.
  grunt.registerHelper('usemin:css:revved', function(content) {
    grunt.log.writeln('Update CSS with new img filenames.');

    var replaceRE = new RegExp("url\\(\\s*['\"]([^\"']+)[\"']\\s*\\)", 'gm');
    //content = grunt.helper('replaceWithRevved', content, /url\(\s*['"]([^"']+)["']\s*\)/gm);
    content = grunt.helper('replaceWithRevved', content, replaceRE);
    return content;
  });
  
  grunt.registerHelper('usemin:html:revved', function(content) {
    var replaceRe;

    grunt.log.verbose.writeln('Update the HTML to reference our concat/min/revved script files');
    //replaceRe = /<script.+src=['"](.+)["'][\/>]?><[\\]?\/script>/gm
    //replaceRe = new RegExp("<script.+src=['\"](.+)[\"'][\/>]?><[\\]?\/script>", 'gm');
    content = grunt.helper('replaceWithRevved', content, /<script.+src=['"](.+)["'][\/>]?><[\\]?\/script>/gm);
    content = grunt.helper('replaceWithRevved', content, /<script.+data-main=['"](.+)["'].*src=.*[\/>]?><[\\]?\/script>/gm);
    if (grunt.config('rjs.almond')) {
      content = content.replace(/<script.+data-main=['"](.+)["'].*src=.*[\/>]?><[\\]?\/script>/gm, function(match, src) {
        var res = match.replace(/\s*src=['"].*["']/gm, '').replace('data-main', 'src');
        grunt.log.ok('almond')
          .writeln('was ' + match)
          .writeln('now ' + res);
        return res;
      });
    }

    grunt.log.verbose.writeln('Update the HTML with the new css filenames');
    //content = grunt.helper('replaceWithRevved', content, /<link rel=["']?stylesheet["']?\shref=['"](.+)["']\s*>/gm);
    
    content = grunt.helper('replaceWithRevved', content, /<link rel=["']?stylesheet["']?\shref=['"](.+)["']\s*>/gm);

    grunt.log.verbose.writeln('Update the HTML with the new img filenames');
    content = grunt.helper('replaceWithRevved', content, /<img[^\>]+src=['"]([^"']+)["']/gm);

    grunt.log.verbose.writeln('Update the HTML with background imgs, case there is some inline style');
    replaceRE = new RegExp("url\\(\\s*['\"]([^\"']+)[\"']\\s*\\)", 'gm');
    //content = grunt.helper('replaceWithRevved', content, /url\(\s*['"]([^"']+)["']\s*\)/gm);
    content = grunt.helper('replaceWithRevved', content, replaceRE);

    return content;
  });

  /**
   * global replace handler, takes a file content a regexp to macth with. The
   * regexp should capture the assets relative filepath, it is then compared to
   * the list of files on the filesystem to guess the actual revision of a file
   */
  grunt.registerHelper('replaceWithRevved', function(content, regexp, search) {
    return content.replace(regexp, function(match, src) {
      //do not touch external files
      if(src.match(/\/\//)) return match;
      var basename = path.basename(src);
      var dirname = path.dirname(src);

      // XXX files won't change, the filepath should filter the original list
      // of cached files.
      var filepath = grunt.file.expand(path.join('**/*') + basename)[0];

      // not a file in intermediate, skip it
      if(!filepath) return match;
      var filename = path.basename(filepath);
      // handle the relative prefix (with always unix like path even on win32)
      filename = [dirname, filename].join('/');

      // if file not exists probaly was concatenated into another file so skip it
      if(!filename) return '';

      var res = match.replace(src, filename);
      // output some verbose info on what get replaced
      grunt.log
        .ok(src)
        .writeln('was ' + match)
        .writeln('now ' + res);

      return res;
    });
  });

  
    
  /**
   * Returns an hash object of all the directives for the given html. Results is
   * of the following form:
   * {
   *  'css/site.css ':[
   *    '  <!-- build:css css/site.css -->',
   *    '  <link rel="stylesheet" href="css/style.css">',
   *    '  <!-- endbuild -->'
   *  ],
   *  'js/head.js ': [
   *    '  <!-- build:js js/head.js -->',
   *    '  <script src="js/libs/modernizr-2.5.3.min.js"></script>',
   *    '  <!-- endbuild -->'
   *  ],
   *  'js/site.js ': [
   *    '  <!-- build:js js/site.js -->',
   *    '  <script src="js/plugins.js"></script>',
   *    '  <script src="js/script.js"></script>',
   *    '  <!-- endbuild -->'
   *  ]
   *}
   */
  grunt.registerHelper('usemin:getblocks:html', function(content){
    // start build pattern --> <!-- build:[target] output -->
    var blockStartRe = /<!--\s*build:(\w+)\s*(.+)\s*-->/;

    // end build pattern -- <!-- endbuild -->
    var blockEndRe = /<!--\s*endbuild\s*-->/;

    var lines = body.replace(/\r\n/g, '\n').split(/\n/),
      block = false,
      sections = {},
      last;

    lines.forEach(function(l){
      var build = l.match(blockStartRe),
        endbuild = blockEndRe.test(l);

      if(build) {
        block = true;
        sections[[build[1], build[2].trim()].join(':')] = last = [];
      }

      // switch back block flag when endbuild
      if(block && endbuild) {
        last.push(l);
        block = false;
      }

      if(block && last) {
        last.push(l);
      }
    });

    return sections;
  });
};