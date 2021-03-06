const User = require('./models/user');
const Message = require('./models/message');

module.exports = (io) => {
  const sendCachedMessage = (user) => {
    Message.findOne({user: user._id})
    .exec((err, message) => {
      if (err) {
        console.log("ERROR: Could not search for message.");
      } else {
        if (!message) {
          console.log("INFO: No messages belonging to user " + user.macAddress);
          return null;
        } else {
          io.to(user.socketUuid).emit('msg qos1', message.message);
          console.log("INFO: Cached message found and delivered for user " + user.macAddress);
        }
      }
    });
  };

  const cacheMessage = (user, message) => {
    let newMessage = Message({
      user: user._id,
      message: message
    });
    newMessage.save((err, data) => {
      if (err) {
        console.log("ERROR: Could not save message.");
        console.log(err);
      } else {
        console.log("INFO: Saved message for " + user.macAddress);
      }
    });
  };

  io.on('connect', socket => {
    console.log(`INFO: New client with id ${socket.id} connected.`);

    // Ask client for mac address
    socket.emit('send mac', '');

    socket.on('hey', (data) => {
      console.log("INFO: Received hey from client.");
      socket.send('OK');
    });

    // When user sends their mac address, update the socket id
    socket.on('mac', (data) => {
      console.log(data);
      console.log(`INFO: Received mac ${data.macAddress} from ${socket.id}`);

      // Search for user, update their socketUuid.
      User.findOne({macAddress: data.macAddress})
      .exec((err, user) => {
        if (err) {
          console.log("ERROR: Could not search for user.");
        } else {
          if (!user) {
            console.log(`INFO: User ${data.macAddress} not found, creating new user.`);
            let newUser = User({
              macAddress: data.macAddress,
              socketUuid: socket.id
            });
            newUser.save((_err, _data) => {
              if (_err) {
                console.log("ERROR: Could not save user.");
              } else {
                console.log(`INFO: Created new user with mac address ${_data.macAddress}`);
              }
            });
          } else {
            user.socketUuid = socket.id;
            user.save((_err) => {
              console.log(`INFO: Updated socket id of user ${user.macAddress}`);
              sendCachedMessage(user);
            });
          }
        }
      });
    });

    // When user sends a message, send it to the destination
    socket.on('msg', (data, id) => {
      // Forward message to pair
      console.log(`INFO: Got message addressed to ${data.macAddress}`);
      User.findOne({macAddress: data.macAddress})
      .exec((err, user) => {
        if (err) {
          console.log("ERROR: Could not search.");
        } else if (user) {
          if (user.socketUuid !== null) {
            // Send message
            io.to(user.socketUuid).emit('msg', data);
            console.log("INFO: Delivered message to " + user.socketUuid);
          } else {
            console.log(`INFO: User ${user.macAddress} is disconnected.`);
            socket.emit('partner offline');
          }
        } else {
          console.log(`INFO: User ${data.macAddress} could not be found in the database.`);
          socket.emit('unknown user');
        }
      });
    });

    socket.on('msg qos1', (data, id) => {
      // Forward message to pair
      console.log(`INFO: Got message addressed to ${data.macAddress}`);
      User.findOne({macAddress: data.macAddress})
      .exec((err, user) => {
        if (err) {
          console.log("ERROR: Could not search.");
        } else if (user) {
          if (user.socketUuid !== null) {
            // Send message
            io.to(user.socketUuid).emit('msg qos1', data);
            console.log("INFO: Delivered message to " + user.socketUuid);
          } else {
            console.log(`INFO: User ${user.macAddress} is disconnected, message will be cached.`);
            socket.emit('partner offline');
            cacheMessage(user, data);
          }
        } else {
          console.log(`INFO: User ${data.macAddress} could not be found in the database.`);
          socket.emit('unknown user');
        }
      });
    });

    socket.on('get stats', (data, id) => {
      console.log('INFO: user stats requested');
      let stats = {
        users: 0,
        usersOnline: 0
      }
      User.countDocuments({socketUuid: null})
      .exec((err, usersOnline) => {
        if (err) {
          console.log("ERROR: Could not count.");
        } else {
          stats.usersOnline = usersOnline;
        }
        User.countDocuments({})
        .exec((err, users) => {
          if (err) {
            console.log("ERROR: Could not count.");
          } else {
            stats.users = users;
            socket.emit('stats', stats);
          }
        });
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`INFO: Client with id ${socket.id} disconnected.`);
      User.findOne({socketUuid: socket.id})
      .exec((err, user) => {
        if (err) {
          console.log("ERROR: Could not search.");
        } else if (user) {
          user.socketUuid = null;
          user.save((_err, data) => {
            console.log(`INFO: Erased socket id of ${user.macAddress}.`);
          });
        } else {
          console.log("WARN: Could not find user after disconnecting.");
        }
      });
    });
  });
};
