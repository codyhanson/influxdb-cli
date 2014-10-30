'use strict';

var request = require('request');
var Url = require('url');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;

function Client(host, port, secure, user, password, database) {
  EventEmitter.call(this);
  this.host = host;
  this.port = port;
  this.user = user;
  this.password = password;
  this.database = database;
  this.protocol = secure ? 'https:' : 'http:';
}

function setCurrentDatabase(self, database) {
  self.database = database;
  self.emit('change:database', database);
}

function url(ctx, db, query) {
  return Url.format({
    protocol: ctx.protocol,
    hostname: ctx.host,
    port: ctx.port,
    pathname: db,
    query: _.extend({
      u: ctx.user,
      p: ctx.password
    }, query || {})
  });
}

function parseCallback(f, start) {
  return function(err, res, body) {
    var elapsed = +new Date() - start;
    if (err) {
      return f(err, null, elapsed);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return f(new Error(body), null, elapsed);
    }
    return f(null, body, elapsed);
  };
}

function parseVersionCallback(f, start) {
    return function(err, res, body){
        return f(null, res.headers['x-influxdb-version'], null);
    }
}

Client.prototype.query = function(query, options, f) {
  query = (query || '').trim();
  options = options || {};
  f = f || function() {};

  var USE_DATABASE_CMD = /use\s([^;]*)/g.exec(query);
  if (USE_DATABASE_CMD) {
    setCurrentDatabase(this, USE_DATABASE_CMD[1]);
    return f(null);
  }
  
  // user just pressed enter
  if(query == ''){ return f(null, ''); };

  if (query.toLowerCase().indexOf('quit') !== -1 || query.toLowerCase().indexOf('exit') !== -1) {
    this.emit('quit');
    return f(null);
  }

  var start = +new Date();
  var params = _.defaults(options, {
    q: query,
    time_precision: 'm',
    chunked: false
  });


  // special command to ping the server
  if (query.toLowerCase() === 'ping') {
    request({
      url: url(this, 'ping', params),
      json: true
    }, parseCallback(f, start));
    return;
  }

  //special command to get the version from the server.
  if (query.toLowerCase() === 'version') {
    request({
      url: url(this, 'ping', params),
      json: true
    }, parseVersionCallback(f, start));
    return;
  }

  // console.log(url('db/' + database + '/series', params));
  request({
    url: url(this, 'db/' + this.database + '/series', params),
    json: true
  }, parseCallback(f, start));
};

Client.prototype.existDatabase = function(dbName, f) {
  return f(null, true);

  // Only work for admins
  // @todo fix this
  // console.log(url('dbs'));
  // request({
  //   url: url('db/' + database + '/series'),
  //   json: true
  // }, parseCallback(function(err, dbs) {
  //   if (err) {
  //     return f(err, dbs);
  //   }

  //   var exist = _.find(dbs, function(db) {
  //     return db.name === dbName;
  //   });


  //   return f(err, exist);
  // }));
};

Client.prototype.getCurrentDatabase = function() {
  return this.database;
};

_.extend(Client.prototype, EventEmitter.prototype);

module.exports = Client;
