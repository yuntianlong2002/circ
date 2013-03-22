// Generated by CoffeeScript 1.4.0
(function() {
  "use strict";
  var ServerResponseHandler, exports, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  var exports = (_ref = window.irc) != null ? _ref : window.irc = {};

  /*
   * Handles messages from an IRC server.
  */


  ServerResponseHandler = (function(_super) {

    __extends(ServerResponseHandler, _super);

    function ServerResponseHandler(irc) {
      this.irc = irc;
      ServerResponseHandler.__super__.constructor.apply(this, arguments);
      this.ctcpHandler = new window.irc.CTCPHandler;
    }

    ServerResponseHandler.prototype.canHandle = function(type) {
      if (this._isErrorMessage(type)) {
        return true;
      } else {
        return ServerResponseHandler.__super__.canHandle.call(this, type);
      }
    };

    /*
       * Handle a message of the given type. Error messages are handled with the
       * default error handler unless a handler is explicitly specified.
       * @param {string} type The type of message (e.g. PRIVMSG).
       * @param {object...} params A variable number of arguments.
    */


    ServerResponseHandler.prototype.handle = function() {
      var params, type;
      type = arguments[0], params = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      if (this._isErrorMessage(type) && !(type in this._handlers)) {
        type = 'error';
      }
      return ServerResponseHandler.__super__.handle.apply(this, [type].concat(__slice.call(params)));
    };

    ServerResponseHandler.prototype._isErrorMessage = function(type) {
      var _ref1;
      return (400 <= (_ref1 = parseInt(type)) && _ref1 < 600);
    };

    ServerResponseHandler.prototype._handlers = {
      /*
           * rpl_welcome
      */

      1: function(from, nick, msg) {
        var chan, _results;
        if (this.irc.state === 'disconnecting') {
          this.irc.quit();
          return;
        }
        this.irc.nick = nick;
        this.irc.state = 'connected';
        this.irc.emit('connect');
        this.irc.emitMessage('welcome', chat.SERVER_WINDOW, msg);
        _results = [];
        for (chan in this.irc.channels) {
          if (this.irc.channels[chan].key) {
            _results.push(this.irc.send('JOIN', chan, this.irc.channels[chan].key));
          } else {
            _results.push(this.irc.send('JOIN', chan));
          }
        }
        return _results;
      },

      /*
       * rpl_isupport.
       *
       * We might get multiple, so this just adds to the support object.
       */
      5: function() {
        // Parameters passed in arguments, pull out the parts we want.
        var m = Array.prototype.slice.call(arguments, 2, arguments.length - 1);
        for (var i = 0; i < m.length; i++) {
          var param = m[i].split(/=/, 2);
          var k = param[0].toLowerCase();
          if (param.length == 1)
            this.irc.support[k] = true;
          else
            this.irc.support[k] = param[1];
        }
      },

      /*
           * rpl_namreply
      */

      353: function(from, target, privacy, channel, names) {
        var n, nameList, newNames, _base, _i, _len, _ref1, _ref2;
        nameList = (_ref1 = (_base = this.irc.partialNameLists)[channel]) != null ? _ref1 : _base[channel] = {};
        newNames = [];
        _ref2 = names.split(/\x20/);
        for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
          n = _ref2[_i];
          /*
                   * TODO: read the prefixes and modes that they imply out of the 005 message
          */

          n = n.replace(/^[~&@%+]/, '');
          if (n) {
            nameList[irc.util.normaliseNick(n)] = n;
            newNames.push(n);
          }
        }
        return this.irc.emit('names', channel, newNames);
      },
      /*
           * rpl_endofnames
      */

      366: function(from, target, channel, _) {
        if (this.irc.channels[channel]) {
          this.irc.channels[channel].names = this.irc.partialNameLists[channel];
        }
        return delete this.irc.partialNameLists[channel];
      },
      NICK: function(from, newNick, msg) {
        var chan, chanName, newNormNick, normNick, _ref1, _results;
        if (this.irc.isOwnNick(from.nick)) {
          this.irc.nick = newNick;
          this.irc.emit('nick', newNick);
          this.irc.emitMessage('nick', chat.SERVER_WINDOW, from.nick, newNick);
        }
        normNick = this.irc.util.normaliseNick(from.nick);
        newNormNick = this.irc.util.normaliseNick(newNick);
        _ref1 = this.irc.channels;
        _results = [];
        for (chanName in _ref1) {
          chan = _ref1[chanName];
          if (!(normNick in chan.names)) {
            continue;
          }
          delete chan.names[normNick];
          chan.names[newNormNick] = newNick;
          _results.push(this.irc.emitMessage('nick', chanName, from.nick, newNick));
        }
        return _results;
      },
      JOIN: function(from, chanName) {
        var chan;
        chan = this.irc.channels[chanName];
        if (this.irc.isOwnNick(from.nick)) {
          if (chan != null) {
            chan.names = [];
          } else {
            chan = this.irc.channels[chanName] = {
              names: []
            };
          }
          this.irc.emit('joined', chanName);
        }
        if (chan) {
          chan.names[irc.util.normaliseNick(from.nick)] = from.nick;
          return this.irc.emitMessage('join', chanName, from.nick);
        } else {
          return console.warn("Got JOIN for channel we're not in (" + chan + ")");
        }
      },
      PART: function(from, chan) {
        var c;
        if (c = this.irc.channels[chan]) {
          this.irc.emitMessage('part', chan, from.nick);
          if (this.irc.isOwnNick(from.nick)) {
            delete this.irc.channels[chan];
            return this.irc.emit('parted', chan);
          } else {
            return delete c.names[irc.util.normaliseNick(from.nick)];
          }
        } else {
          return console.warn("Got TOPIC for a channel we're not in: " + chan);
        }
      },
      QUIT: function(from, reason) {
        var chan, chanName, normNick, _ref1, _results;
        normNick = irc.util.normaliseNick(from.nick);
        _ref1 = this.irc.channels;
        _results = [];
        for (chanName in _ref1) {
          chan = _ref1[chanName];
          if (!(normNick in chan.names)) {
            continue;
          }
          delete chan.names[normNick];
          _results.push(this.irc.emitMessage('quit', chanName, from.nick, reason));
        }
        return _results;
      },
      PRIVMSG: function(from, target, msg) {
        if (this.ctcpHandler.isCTCPRequest(msg)) {
          return this._handleCTCPRequest(from, target, msg);
        } else {
          return this.irc.emitMessage('privmsg', target, from.nick, msg);
        }
      },
      NOTICE: function(from, target, msg) {
        var event;
        if (!from.user) {
          return this.irc.emitMessage('notice', chat.SERVER_WINDOW, msg);
        }
        event = new Event('message', 'privmsg', from.nick, msg);
        event.setContext(this.irc.server, chat.CURRENT_WINDOW);
        event.addStyle('notice');
        return this.irc.emitCustomMessage(event);
      },
      PING: function(from, payload) {
        return this.irc.send('PONG', payload);
      },
      PONG: function(from, payload) {},
      TOPIC: function(from, channel, topic) {
        if (this.irc.channels[channel] != null) {
          this.irc.channels[channel].topic = topic;
          return this.irc.emitMessage('topic', channel, from.nick, topic);
        } else {
          return console.warn("Got TOPIC for a channel we're not in (" + channel + ")");
        }
      },
      KICK: function(from, channel, to, reason) {
        if (!this.irc.channels[channel]) {
          console.warn("Got KICK message from " + from + " to " + to + " in channel we are not in (" + channel + ")");
          return;
        }
        delete this.irc.channels[channel].names[to];
        this.irc.emitMessage('kick', channel, from.nick, to, reason);
        if (this.irc.isOwnNick(to)) {
          return this.irc.emit('parted', channel);
        }
      },
      MODE: function(from, chan, mode, to) {
        return this.irc.emitMessage('mode', chan, from.nick, to, mode);
      },
      /*
           * rpl_umodeis
      */

      221: function(from, to, mode) {
        return this.irc.emitMessage('user_mode', chat.CURRENT_WINDOW, to, mode);
      },
      /*
           * rpl_away
      */

      301: function(from, target, who, msg) {
        /*
               * send a direct message from the user, saying the other user is away
        */
        return this.irc.emitMessage('privmsg', target, who, msg);
      },
      /*
           * rpl_unaway
      */

      305: function(from, to, msg) {
        this.irc.away = false;
        return this.irc.emitMessage('away', chat.CURRENT_WINDOW, msg);
      },
      /*
           * rpl_nowaway
      */

      306: function(from, to, msg) {
        this.irc.away = true;
        return this.irc.emitMessage('away', chat.CURRENT_WINDOW, msg);
      },
      /*
           * rpl_channelmodeis
      */

      324: function(from, to, channel, mode, modeParams) {
        var message;
        message = "Channel modes: " + mode + " " + (modeParams != null ? modeParams : '');
        return this.irc.emitMessage('notice', channel, message);
      },
      /*
           * rpl_channelcreated
      */

      329: function(from, to, channel, time) {
        var message;
        message = "Channel created on " + (getReadableTime(parseInt(time)));
        return this.irc.emitMessage('notice', channel, message);
      },
      /*
           * rpl_notopic
      */

      331: function(from, to, channel, msg) {
        return this.handle('TOPIC', {}, channel);
      },
      /*
           * rpl_topic
      */

      332: function(from, to, channel, topic) {
        return this.handle('TOPIC', {}, channel, topic);
      },
      /*
           * rpl_topicwhotime
      */

      333: function(from, to, channel, who, time) {
        return this.irc.emitMessage('topic_info', channel, who, time);
      },
      /*
           * err_nicknameinuse
      */

      433: function(from, nick, taken) {
        var newNick;
        newNick = taken + '_';
        if (nick === newNick) {
          newNick = void 0;
        }
        this.irc.emitMessage('nickinuse', chat.CURRENT_WINDOW, taken, newNick);
        if (newNick) {
          return this.irc.send('NICK', newNick);
        }
      },
      /*
           * The default error handler for error messages. This handler is used for all
           * 4XX error messages unless a handler is explicitly specified.
           *
           * Messages are displayed in the following format:
           *   "<arg1> <arg2> ... <argn>: <message>
      */

      error: function() {
        var args, from, message, msg, to, _i;
        from = arguments[0], to = arguments[1], args = 4 <= arguments.length ? __slice.call(arguments, 2, _i = arguments.length - 1) : (_i = 2, []), msg = arguments[_i++];
        if (args.length > 0) {
          message = "" + (args.join(' ')) + " :" + msg;
        } else {
          message = msg;
        }
        return this.irc.emitMessage('error', chat.CURRENT_WINDOW, message);
      },
      KILL: function(from, victim, killer, msg) {
        return this.irc.emitMessage('kill', chat.CURRENT_WINDOW, killer.nick, victim, msg);
      }
    };

    ServerResponseHandler.prototype._handleCTCPRequest = function(from, target, msg) {
      var message, name, response, _i, _len, _ref1, _results;
      name = this.ctcpHandler.getReadableName(msg);
      message = "Received a CTCP " + name + " from " + from.nick;
      this.irc.emitMessage('notice', chat.CURRENT_WINDOW, message);
      _ref1 = this.ctcpHandler.getResponses(msg);
      _results = [];
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        response = _ref1[_i];
        _results.push(this.irc.doCommand('NOTICE', from.nick, response, true));
      }
      return _results;
    };

    return ServerResponseHandler;

  })(MessageHandler);

  exports.ServerResponseHandler = ServerResponseHandler;

}).call(this);