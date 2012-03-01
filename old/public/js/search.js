$(function() {


  //
  // Displays initial waitstate of search. Should render placeholders for search results.
  //
  View.Search = Backbone.View.extend({
    waitstate_template : Handlebars.compile($('#search-waitstate-template').html()),

    render: function() {
      $(this.el).html(this.waitstate_template(this.model.toJSON()))

      if (_.isUndefined(this.model.artist.view)) {
        this.model.artist.view = new View.SearchArtists({ collection: this.model.artist })
        this.model.album.view  = new View.SearchAlbums({ collection: this.model.album })
        this.model.track.view  = new View.SearchTracks({ collection: this.model.track })
      }
      return this
    }
  })


  //
  // Holds collections of search results for tracks, artists, and albums.
  // Handles querying last.fm for search results as well.
  //
  Model.Search = Backbone.Model.extend({
    lastfmAPIKey: '75c8c3065db32d805a292ec1af5631a3',

    initialize: function() {
      this.artist = new Collection.Artists()
      this.album  = new Collection.Albums()
      this.track  = new Collection.Tracks()

      this.view = new View.Search({ model: this })

      this.artist.page = 1
      this.album.page  = 1
      this.track.page  = 1

      this.query()
    },

    // Debounce will keep the queries from firing off if back/forward is repeatedly pressed.
    query: _.debounce(function(types) {
      var self = this
      types = types || [ 'artist', 'album', 'track' ]

      _.forEach(types, function(type) {
        var params = {
          api_key     : self.lastfmAPIKey,
          method      : type + '.search',
          page        : self[type].page,
          autocorrect : 1,
          format      : 'json',
          callback    : 'window.Search.queryCallback',
        }
        params[type] = self.get('query')

        $.getScript('http://ws.audioscrobbler.com/2.0/?' + $.param(params))
      })
    }, 600),

    queryCallback: function(data) {
      var self = this
      if (!self.isCurrentQuery(data.results)) {
        return
      }

      // Figure out the type by searching json, e.g. results.artistmatches
      _.forEach([ 'artist', 'album', 'track' ], function(type) {
        if (_.isUndefined(data.results[type + 'matches'])) {
          return
        }
        self[type].loading = false

        self[type].page++
        self[type].view.render()
        _.forEach(data.results[type + 'matches'][type], function(result) {
          self[type].add(self.resultToJSON(type, result))
        })
      })
    },

    loadMore: function(type) {
      if (this[type].loading) {
        return
      }
      this[type].loading = true
      this.query([ 'track' ])
    },

    isCurrentQuery: function(results) {
      return results ? (this.get('query') == results['@attr'].for) : false
    },

    resultToJSON: function(type, result) {
      var self = this
      switch (type) {
        case 'track':
          return new Model.Track({
            artist    : result.artist,
            name      : result.name,
            image     : self.resultImage(result),
            listeners : result.listeners || 0
          })
        case 'artist':
          return new Model.Artist({
            name      : result.name,
            image     : self.resultImage(result),
            listeners : result.listeners || 0
          })
        case 'album':
          return new Model.Album({
            artist  : result.artist,
            name    : result.name,
            albumid : result.id,
            image   : self.resultImage(result),
          })
        case 'tag':
          return new Model.Tag({
            name  : result.name,
            count : result.count
          })
        default:
          return null
      }
    },

    resultImage: function(result, size){
      var src = '',
          size = size || 'large'
      if (_.isArray(result.image)) {
        _.each(result.image, function(image) {
          if (image.size == size) {
            src = image['#text']
          }
        })
      } else if (!_.isUndefined(result.image)) {
        src = result.image
      }
      return src
    }
  })


  //
  // Displays a particular search result (e.g. a single track, artist, or album).
  //
  View.SearchResult = Backbone.View.extend({
    tagName: 'li',

    initialize: function() {
      this.model.view = this
      this.render()
    },

    render: function() {
      $(this.el).html(this.template(this.model.toJSON()))
      return this
    }
  })


  //
  // Displays a collection of search results.
  //
  View.SearchResults = Backbone.View.extend({
    templateEmpty: Handlebars.compile($('#search-empty-template').html()),

    initialize: function() {
      var self = this

      ;['artist', 'album', 'track'].forEach(function(type) {
        if (self.collection.model == Model[type.capitalize()]) {
          self.type = type
        }
      })

      self.collection.bind('add', self.addModel)
      _.bindAll(self, 'addModel')
    },

    render: function() {
      if (this.collection.models.length == 0) {
        $(this.el).html(this.templateEmpty({ type: this.type }))
      }
      return this
    },

    addModel: function(model) {
      if (this.models.length == 1) {
        $(this.view.el).html(this.view.template())
        $('#search').find('.' + this.view.type + 's').replaceWith(this.view.el)
      }

      var view = new this.view.viewObject({ model : model })
      $(this.view.el).find(this.view.viewInner).append(view.el)
    }
  })


  //
  // View behavior for search results that are tracks.
  //
  View.SearchTrack = View.SearchResult.extend(_.extend({
    tagName: 'tr',
    className: 'track',
    template: Handlebars.compile($('#search-track-template').html()),

    events: {
      'click'       : 'toggleSelect',
      'dblclick'    : 'play',
      'contextmenu' : 'showContextmenu'
    },

    initialize: function() {
      _.bindAll(this, 'play', 'queueTrack', 'queueNext', 'queueLast')
      this.model.view = this
      this.render()
    },
    
    play: function() {
      this.queueTrack('play')
    },

    queueNext: function() {
      this.queueTrack('next')
    },

    queueLast: function() {
      this.queueTrack('last')
    },

    // Adds selected tracks to NowPlaying collection.
    queueTrack: function(method) {
      $(this.el).addClass('selected')
      
      var tracks = _(Search.track.models).chain()
        .map(function(track) {
          if (!$(track.view.el).hasClass('selected')) {
            return null
          }
          $(track.view.el).removeClass('selected')

          var copyTrack = new Model.Track(track.toJSON())
          copyTrack.playlist = NowPlaying
          return copyTrack
        }).compact().value()

        NowPlaying.add(tracks, { method: method })
    },
    
    showContextmenu: function(e) {
      if (!$(this.el).hasClass('select')) {
        this.toggleSelect(e)
      }
      
      new Model.Contextmenu({
        event: e,
        actions: [
          { action: 'Play', extra: 'dblclick', callback: this.play },
          { action: 'Queue Next', callback: this.queueNext },
          { action: 'Queue Last', callback: this.queueLast }
        ]
      })
      return false
    }

  }, Mixins.TrackSelection))


  //
  // Placeholder for multiple tracks as search results.
  //
  View.SearchTracks = View.SearchResults.extend({
    className: 'tracks',
    template: Handlebars.compile($('#search-tracks-template').html()),
    viewObject: View.SearchTrack,
    viewInner: 'table tbody'
  })


})
