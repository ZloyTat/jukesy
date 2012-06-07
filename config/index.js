var _ = require('underscore')
  , moment = require('moment')
  , fs = require('fs')
  , express = require('express')
  , MongoStore = require('connect-mongo')

module.exports = function(app) {

  _.mixin({
    capitalize: function(string) {
      string = '' + string
      return string.charAt(0).toUpperCase() + string.substring(1).toLowerCase()
    },
    plural: function(count, singular, plural) {
      return count == 1 ? singular : plural
    }
  })

  // Restrict environments to what we anticipate
  if (['development', 'test', 'staging', 'production'].indexOf(app.set('env')) == -1) {
    app.set('env', 'development')
  }

  app.set('base_url', {
    development : 'http://jukesy.local:3000',
    test        : 'http://jukesy.test:7357',
    staging     : 'http://staging.jukesy.com',
    production  : 'http://jukesy.com'
  }[app.set('env')])

  app.set('port', {
    development : '3000',
    test        : '7357',
    staging     : '4000',
    production  : '3000'
  }[app.set('env')])

  app._       = _
  app.moment  = moment
  app.assets  = require('./assets')[app.set('env')]
  app.mongodb = require('./mongodb')[app.set('env')]
  app.pepper  = require('./pepper')

  app.mongooseSetters = require('../lib/mongoose_setters')
  app.mongoosePlugins = require('../lib/mongoose_plugins')
  app.mongooseValidators = require('../lib/mongoose_validators')

  app.auth = require('../lib/auth')
  app.lastfm_cache = require('../lib/lastfm_cache')
  app.lastfm_cache.startQueue()
  
  app.meta = function(meta) {
    return app._.extend({
      title       : 'jukesy - watch music videos',
      description : 'Jukesy is an application that helps you watch music videos from YouTube. ' +
                    'With Jukesy, you can create playlists, discover new music, listen to your favorite albums, and more.',
      image       : 'http://static2.jukesy.com/img/jukesy-256.png',
      type        : 'website',
      url         : app.set('base_url')
    }, meta)
  }

  app.Error   = require('../lib/error')

  app.model = function(modelName) {
    return app.db.model(app._.capitalize(modelName))
  }

  app.controller = function(controllerName) {
    return app.controllers[app._.capitalize(controllerName)]
  }

  // Express config

  app.configure('development', 'staging', 'production', function() {
    app.use(express.logger('dev'))
  })

  app.configure(function() {
    app.dynamicHelpers({
      jadeLiteral: function(req, res) {
        return function(filename) {
          return fs.readFileSync(__dirname + '/../app/views/' + filename + '.jade', 'utf8')
        }
      },
      // let's just put all the hacks in one place
      env: function() { return app.set('env') },
      assets: function() { return app.assets },
      gitsha: function() { return app.gitsha },
      currentUser: function(req, res) { return req.currentUser },
      moment: function() { return app.moment },
      _: function() { return app._ },
      Charts: function() { return app.charts },
      baseUrl: function() { return app.set('base_url') }
    })

    app
      .set('host', 'localhost')
      .set('views', __dirname + '/../app/views')
      .set('view engine', 'jade')

    app
      .use(express.static(__dirname + '/../public'))
      .use(express.bodyParser())
      .use(express.cookieParser())
      .use(express.session({
        secret: 'jukesy',
        cookie: {
          expires: new Date(Date.now() + 86400000)
        },
        store: new MongoStore({
          auto_reconnect: true,
          host: app.mongodb.host,
          db: 'jukesy-sessions'
        })
      }))
      .use(express.errorHandler({ dumpExceptions: true, showStack: true }))
      .use(express.methodOverride())
      .use(app.router)
  })

}
