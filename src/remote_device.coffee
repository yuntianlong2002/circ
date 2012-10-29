exports = window

class RemoteDevice extends EventEmitter

  # Begin at this port and increment by one until an open port is found.
  @BASE_PORT: 1329
  @MAX_CONNECTION_ATTEMPTS: 30
  @FINDING_PORT: -1
  @PORT_NOT_FOUND: -2

  constructor: (addr, port) ->
    super
    @_receivedMessages = ''
    @id = addr
    if typeof addr is 'string'
      @_initFromAddress addr, port
    else if addr
      @_initFromSocketId addr
    else
      @port = RemoteDevice.PORT_NOT_FOUND

  equals: (otherDevice) ->
    return @id is otherDevice?.id

  usesConnection: (connectionInfo) ->
    return connectionInfo.addr is @addr and connectionInfo.port is @port

  getState: ->
    switch @port
      when RemoteDevice.FINDING_PORT then 'finding_port'
      when RemoteDevice.PORT_NOT_FOUND then 'no_port'
      else 'found_port'

  _initFromAddress: (@addr, @port) ->

  _initFromSocketId: (@_socketId) ->
    @_listenForData()

  @getOwnDevice: (callback) ->
    unless chrome.socket.listen
      device = new RemoteDevice '', RemoteDevice.PORT_NOT_FOUND
      device.possibleAddrs = []
      callback device
      return

    chrome.socket?.getNetworkList (networkInfoList) =>
      possibleAddrs = (networkInfo.address for networkInfo in networkInfoList)
      if possibleAddrs.length > 0
        addr = RemoteDevice._getValidAddr possibleAddrs
        device = new RemoteDevice addr, RemoteDevice.FINDING_PORT
      else
        device = new RemoteDevice '', RemoteDevice.PORT_NOT_FOUND
      device.possibleAddrs = possibleAddrs
      callback device

  @_getValidAddr: (addrs) ->
    # TODO currently we return the first IPv4 address. Will this always work?
    shortest = addrs[0]
    for addr in addrs
      shortest = addr if addr.length < shortest.length
    shortest

  ##
  # Called when the device is your own device. Listens for connecting client
  # devices.
  ##
  listenForNewDevices: (callback) ->
    chrome.socket?.create 'tcp', {}, (socketInfo) =>
      @_socketId = socketInfo.socketId
      @_listenOnValidPort callback

  ##
  # Attempt to listen on the default port, then increment the port by a random
  # amount if the attempt fails and try again.
  ##
  _listenOnValidPort: (callback, port) =>
    port = RemoteDevice.BASE_PORT unless port >= 0
    chrome.socket.listen @_socketId, '0.0.0.0', port, (result) =>
      @_onListen callback, port, result

  _onListen: (callback, port, result) ->
    if result < 0
      @_onFailedToListen callback, port, result
    else
      @port = port
      @emit 'found_port', this
      @_acceptNewConnection callback

  _onFailedToListen: (callback, port, result) ->
    if port - RemoteDevice.BASE_PORT > RemoteDevice.MAX_CONNECTION_ATTEMPTS
        console.error "Couldn't listen to 0.0.0.0 on any attempted ports"
        @port = RemoteDevice.PORT_NOT_FOUND
    else
      @_listenOnValidPort callback, port + Math.floor Math.random() * 100

  _acceptNewConnection: (callback) ->
    @_log 'Now listening to 0.0.0.0 on port', @port
    chrome.socket?.accept @_socketId, (acceptInfo) =>
      return unless acceptInfo.socketId
      @_log 'Connected to a client device', @_socketId
      callback new RemoteDevice acceptInfo.socketId
      @_acceptNewConnection callback

  send: (type, args) ->
    msg = JSON.stringify { type, args }
    msg = msg.length + '$' + msg
    irc.util.toSocketData msg, (data) =>
      chrome.socket?.write @_socketId, data, (writeInfo) =>
        if writeInfo.resultCode < 0
          @_log 'w', 'failed to send:', type, args, writeInfo.resultCode
        else if writeInfo.bytesWritten != data.byteLength
          @_log 'w', 'failed to send (non-complete-write):', type, args, writeInfo.resultCode
        else
          @_log 'sent', type, args

  ##
  # Called when the device represents a remote server. Creates a connection
  # to that remote server.
  ##
  connect: (callback) ->
    @close()
    chrome.socket?.create 'tcp', {}, (socketInfo) =>
      @_socketId = socketInfo.socketId
      callback false unless @_socketId
      chrome.socket?.connect @_socketId, @addr, @port, (result) =>
        console.log 'Connected to server', @addr, 'on port', @port
        @_onConnect result, callback

  _onConnect: (result, callback) ->
    if result < 0
      @_log 'w', "Couldn't connect to server", @addr, 'on port', @port, '-', result
      callback false
    else
      @_listenForData()
      callback true

  ##
  # Called when a remote device to find the remote ip address.
  ##
  getAddr: (callback) ->
    chrome.socket?.getInfo @_socketId, (socketInfo) =>
      @addr = socketInfo.peerAddress
      callback()

  ##
  # Called when a remote server device to authenticate the connection.
  ##
  sendAuthentication: (getAuthToken) ->
    chrome.socket?.getInfo @_socketId, (socketInfo) =>
      @send 'authenticate', [getAuthToken socketInfo.localAddress]

  close: ->
    if @_socketId
      chrome.socket?.destroy @_socketId
      @emit 'closed', this

  _listenForData: ->
    chrome.socket?.read @_socketId, (readInfo) =>
      if readInfo.resultCode <= 0
        @_log 'w', 'bad read - closing socket', readInfo.resultCode
        @emit 'closed', this
        @close()
      else if readInfo.data.byteLength
        irc.util.fromSocketData readInfo.data, (partialMessage) =>
          @_receivedMessages += partialMessage
          completeMessages = @_parseReceivedMessages()
          for json in completeMessages
            data = JSON.parse json
            @_log 'received', data.type, data.args...
            @emit data.type, this, data.args...
        @_listenForData()
      else
        @_log 'w', 'onRead - got no data?!'

  _parseReceivedMessages: (result=[]) ->
    return result unless @_receivedMessages
    prefixEnd = @_receivedMessages.indexOf('$')
    return result unless prefixEnd >= 0
    length = parseInt @_receivedMessages[..prefixEnd - 1]
    return result unless @_receivedMessages.length > prefixEnd + length

    message = @_receivedMessages[prefixEnd + 1 .. prefixEnd + length]
    result.push message
    @_receivedMessages = @_receivedMessages[prefixEnd + length + 1..]
    return @_parseReceivedMessages result

  toString: ->
    if @addr
      "#{@addr} on port #{@port}"
    else
      "#{@socketId}"

exports.RemoteDevice = RemoteDevice