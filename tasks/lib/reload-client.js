/*
 * Copyright (c) 2012 webxl
 * Licensed under the MIT license.
 */

(function(window) {

    'use strict';

    var reloader = (function Reloader() {

        var l = window.location, url;

        if (window.__reloadServerUrl) {
            url = window.__reloadServerUrl;
        } else {
            //url = 'ws://' + l.host;
            url = {
                host: l.hostname,
                port: l.port,
                path: '/engine.io',
                resource: 'clientreload',
                transports:['websocket', 'polling', 'flashsocket']
            };
        }

        return {
            connect:function () {
                //this.socket = new WebSocket(url);
                this.socket = new eio.Socket(url);
                this.socket.onopen = function(){
                    console.log('Reload Client: opened');
                }
                this.socket.onmessage = function (msg) {
                    this.close();
                    console.log('Reload Client:', msg.data);
                    window.document.location.reload();
                };
                this.socket.onclose = function(){
                    console.log('Reload Client: Closed');
                    //this.open();
                }
                // Todo: reconnect support
            }
        };

    }());

    setTimeout(function() { reloader.connect(); }, 1000);
}(this));