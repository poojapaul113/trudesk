/*
      .                              .o8                     oooo
   .o8                             "888                     `888
 .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
   888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
   888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
   888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
   "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 ========================================================================
 Created:    02/24/18
 Author:     Chris Brame

 **/

const _ = require('lodash');
const fs = require('fs-extra');
const path = require('path');
const async = require('async');
const winston = require('../logger');
const moment = require('moment-timezone');

const SettingsSchema = require('../models/setting');
const PrioritySchema = require('../models/ticketpriority');

const settingsDefaults = {};
const roleDefaults = {};

roleDefaults.userGrants = ['tickets:create view update', 'comments:create view update'];
roleDefaults.supportGrants = [
  'tickets:*',
  'agent:*',
  'accounts:create update view import',
  'teams:create update view',
  'comments:create view update create delete',
  'reports:view create',
  'notices:*',
];
roleDefaults.adminGrants = [
  'admin:*',
  'agent:*',
  'chat:*',
  'tickets:*',
  'accounts:*',
  'groups:*',
  'teams:*',
  'departments:*',
  'comments:*',
  'reports:*',
  'notices:*',
  'settings:*',
  'api:*',
];

settingsDefaults.roleDefaults = roleDefaults;

function rolesDefault(callback) {
  const roleSchema = require('../models/role');
  async.series(
    [
      function (done) {
        roleSchema.getRoleByName('User', function (err, role) {
          if (err) return done(err);
          if (role) return done();

          roleSchema.create(
            {
              name: 'User',
              description: 'Default role for users',
              grants: roleDefaults.userGrants,
            },
            function (err, userRole) {
              if (err) return done(err);
              SettingsSchema.getSetting('role:user:default', function (err, roleUserDefault) {
                if (err) return done(err);
                if (roleUserDefault) return done();

                SettingsSchema.create(
                  {
                    name: 'role:user:default',
                    value: userRole._id,
                  },
                  done
                );
              });
            }
          );
        });
      },
      function (done) {
        roleSchema.getRoleByName('Support', function (err, role) {
          if (err) return done(err);
          if (role) {
            return done();
            // role.updateGrants(supportGrants, done);
          } else
            roleSchema.create(
              {
                name: 'Support',
                description: 'Default role for agents',
                grants: roleDefaults.supportGrants,
              },
              done
            );
        });
      },
      function (done) {
        roleSchema.getRoleByName('Admin', function (err, role) {
          if (err) return done(err);
          if (role) return done();
          // role.updateGrants(adminGrants, done);
          else {
            roleSchema.create(
              {
                name: 'Admin',
                description: 'Default role for admins',
                grants: roleDefaults.adminGrants,
              },
              done
            );
          }
        });
      },
      function (done) {
        const roleOrderSchema = require('../models/roleorder');
        roleOrderSchema.getOrder(function (err, roleOrder) {
          if (err) return done(err);
          if (roleOrder) return done();

          roleSchema.getRoles(function (err, roles) {
            if (err) return done(err);

            var roleOrder = [];
            roleOrder.push(_.find(roles, { name: 'Admin' })._id);
            roleOrder.push(_.find(roles, { name: 'Support' })._id);
            roleOrder.push(_.find(roles, { name: 'User' })._id);

            roleOrderSchema.create(
              {
                order: roleOrder,
              },
              done
            );
          });
        });
      },
    ],
    function (err) {
      if (err) throw err;

      return callback();
    }
  );
}

function defaultUserRole(callback) {
  var roleOrderSchema = require('../models/roleorder');
  roleOrderSchema.getOrderLean(function (err, roleOrder) {
    if (err) return callback(err);
    if (!roleOrder) return callback();

    SettingsSchema.getSetting('role:user:default', function (err, roleDefault) {
      if (err) return callback(err);
      if (roleDefault) return callback();

      var lastId = _.last(roleOrder.order);
      SettingsSchema.create(
        {
          name: 'role:user:default',
          value: lastId,
        },
        callback
      );
    });
  });
}

function createDirectories(callback) {
  async.parallel(
    [
      function (done) {
        fs.ensureDir(path.join(__dirname, '../../backups'), done);
      },
      function (done) {
        fs.ensureDir(path.join(__dirname, '../../restores'), done);
      },
    ],
    callback
  );
}

function downloadWin32MongoDBTools(callback) {
  var http = require('http');
  var os = require('os');
  var semver = require('semver');
  var dbVersion = require('../database').db.version || '5.0.6';
  var fileVersion = semver.major(dbVersion) + '.' + semver.minor(dbVersion);

  if (os.platform() === 'win32') {
    winston.debug('MongoDB version ' + fileVersion + ' detected.');
    var filename = 'mongodb-tools.' + fileVersion + '-win32x64.zip';
    var savePath = path.join(__dirname, '../backup/bin/win32/');
    fs.ensureDirSync(savePath);
    if (
      !fs.existsSync(path.join(savePath, 'mongodump.exe')) ||
      !fs.existsSync(path.join(savePath, 'mongorestore.exe'))
      // !fs.existsSync(path.join(savePath, 'libeay32.dll')) ||
      // !fs.existsSync(path.join(savePath, 'ssleay32.dll'))
    ) {
      winston.debug('Windows platform detected. Downloading MongoDB Tools [' + filename + ']');
      fs.emptyDirSync(savePath);
      var unzipper = require('unzipper');
      var file = fs.createWriteStream(path.join(savePath, filename));
      http
        .get('http://storage.trudesk.io/tools/' + filename, function (response) {
          response.pipe(file);
          file.on('finish', function () {
            file.close();
          });
          file.on('close', function () {
            fs.createReadStream(path.join(savePath, filename))
              .pipe(unzipper.Extract({ path: savePath }))
              .on('close', function () {
                fs.unlink(path.join(savePath, filename), callback);
              });
          });
        })
        .on('error', function (err) {
          fs.unlink(path.join(savePath, filename));
          winston.debug(err);
          return callback();
        });
    } else {
      return callback();
    }
  } else {
    return callback();
  }
}

function timezoneDefault(callback) {
  SettingsSchema.getSettingByName('gen:timezone', function (err, setting) {
    if (err) {
      winston.warn(err);
      if (_.isFunction(callback)) return callback(err);
      return false;
    }

    if (!setting) {
      var defaultTimezone = new SettingsSchema({
        name: 'gen:timezone',
        value: 'America/New_York',
      });

      defaultTimezone.save(function (err, setting) {
        if (err) {
          winston.warn(err);
          if (_.isFunction(callback)) return callback(err);
        }

        winston.debug('Timezone set to ' + setting.value);
        moment.tz.setDefault(setting.value);

        global.timezone = setting.value;

        if (_.isFunction(callback)) return callback();
      });
    } else {
      winston.debug('Timezone set to ' + setting.value);
      moment.tz.setDefault(setting.value);

      global.timezone = setting.value;

      if (_.isFunction(callback)) return callback();
    }
  });
}

function showTourSettingDefault(callback) {
  SettingsSchema.getSettingByName('showTour:enable', function (err, setting) {
    if (err) {
      winston.warn(err);
      if (_.isFunction(callback)) return callback(err);
      return false;
    }

    if (!setting) {
      var defaultShowTour = new SettingsSchema({
        name: 'showTour:enable',
        value: 0,
      });

      defaultShowTour.save(function (err) {
        if (err) {
          winston.warn(err);
          if (_.isFunction(callback)) return callback(err);
        }

        if (_.isFunction(callback)) return callback();
      });
    } else if (_.isFunction(callback)) return callback();
  });
}

async function ticketTypeSettingDefault(callback) {
  const test = await SettingsSchema.getSettingByName('ticket:type:default');
  winston.info(JSON.stringify(test));
  SettingsSchema.getSettingByName('ticket:type:default', function (err, setting) {
    if (err) {
      winston.warn(err);
      if (_.isFunction(callback)) {
        return callback(err);
      }
    }

    if (!setting) {
      var ticketTypeSchema = require('../models/tickettype');
      ticketTypeSchema.getTypes(function (err, types) {
        if (err) {
          winston.warn(err);
          if (_.isFunction(callback)) {
            return callback(err);
          }
          return false;
        }

        var type = _.first(types);
        if (!type) return callback('No Types Defined!');
        if (!_.isObject(type) || _.isUndefined(type._id)) return callback('Invalid Type. Skipping.');

        // Save default ticket type
        var defaultTicketType = new SettingsSchema({
          name: 'ticket:type:default',
          value: type._id,
        });

        defaultTicketType.save(function (err) {
          if (err) {
            winston.warn(err);
            if (_.isFunction(callback)) {
              return callback(err);
            }
          }

          if (_.isFunction(callback)) {
            return callback();
          }
        });
      });
    } else {
      if (_.isFunction(callback)) {
        return callback();
      }
    }
  });
}

function ticketPriorityDefaults(callback) {
  var priorities = [];

  var normal = new PrioritySchema({
    name: 'Normal',
    migrationNum: 1,
    default: true,
  });

  var urgent = new PrioritySchema({
    name: 'Urgent',
    migrationNum: 2,
    htmlColor: '#8e24aa',
    default: true,
  });

  var critical = new PrioritySchema({
    name: 'Critical',
    migrationNum: 3,
    htmlColor: '#e65100',
    default: true,
  });

  priorities.push(normal);
  priorities.push(urgent);
  priorities.push(critical);
  async.each(
    priorities,
    function (item, next) {
      PrioritySchema.findOne({ migrationNum: item.migrationNum }, function (err, priority) {
        if (!err && (_.isUndefined(priority) || _.isNull(priority))) {
          return item.save(next);
        }

        return next(err);
      });
    },
    callback
  );
}

function normalizeTags(callback) {
  var tagSchema = require('../models/tag');
  tagSchema.find({}, function (err, tags) {
    if (err) return callback(err);
    async.each(
      tags,
      function (tag, next) {
        tag.save(next);
      },
      callback
    );
  });
}

function checkPriorities(callback) {
  var ticketSchema = require('../models/ticket');
  var migrateP1 = false;
  var migrateP2 = false;
  var migrateP3 = false;

  async.parallel(
    [
      function (done) {
        ticketSchema.collection.countDocuments({ priority: 1 }).then(function (count) {
          migrateP1 = count > 0;
          return done();
        });
      },
      function (done) {
        ticketSchema.collection.countDocuments({ priority: 2 }).then(function (count) {
          migrateP2 = count > 0;
          return done();
        });
      },
      function (done) {
        ticketSchema.collection.countDocuments({ priority: 3 }).then(function (count) {
          migrateP3 = count > 0;
          return done();
        });
      },
    ],
    function () {
      async.parallel(
        [
          function (done) {
            if (!migrateP1) return done();
            PrioritySchema.getByMigrationNum(1, function (err, normal) {
              if (!err) {
                winston.debug('Converting Priority: Normal');
                ticketSchema.collection
                  .updateMany({ priority: 1 }, { $set: { priority: normal._id } })
                  .then(function (res) {
                    if (res && res.result) {
                      if (res.result.ok === 1) {
                        return done();
                      }

                      winston.warn(res.message);
                      return done(res.message);
                    }
                  });
              } else {
                winston.warn(err.message);
                return done();
              }
            });
          },
          function (done) {
            if (!migrateP2) return done();
            PrioritySchema.getByMigrationNum(2, function (err, urgent) {
              if (!err) {
                winston.debug('Converting Priority: Urgent');
                ticketSchema.collection
                  .updateMany({ priority: 2 }, { $set: { priority: urgent._id } })
                  .then(function (res) {
                    if (res && res.result) {
                      if (res.result.ok === 1) {
                        return done();
                      }

                      winston.warn(res.message);
                      return done(res.message);
                    }
                  });
              } else {
                winston.warn(err.message);
                return done();
              }
            });
          },
          function (done) {
            if (!migrateP3) return done();
            PrioritySchema.getByMigrationNum(3, function (err, critical) {
              if (!err) {
                winston.debug('Converting Priority: Critical');
                ticketSchema.collection
                  .updateMany({ priority: 3 }, { $set: { priority: critical._id } })
                  .then(function (res) {
                    if (res && res.result) {
                      if (res.result.ok === 1) {
                        return done();
                      }

                      winston.warn(res.message);
                      return done(res.message);
                    }
                  });
              } else {
                winston.warn(err.message);
                return done();
              }
            });
          },
        ],
        callback
      );
    }
  );
}

function addedDefaultPrioritiesToTicketTypes(callback) {
  async.waterfall(
    [
      function (next) {
        PrioritySchema.find({ default: true })
          .then(function (results) {
            return next(null, results);
          })
          .catch(next);
      },
      function (priorities, next) {
        priorities = _.sortBy(priorities, 'migrationNum');
        var ticketTypeSchema = require('../models/tickettype');
        ticketTypeSchema.getTypes(function (err, types) {
          if (err) return next(err);

          async.each(
            types,
            function (type, done) {
              var prioritiesToAdd = [];
              if (!type.priorities || type.priorities.length < 1) {
                type.priorities = [];
                prioritiesToAdd = _.map(priorities, '_id');
              }

              if (prioritiesToAdd.length < 1) {
                return done();
              }

              type.priorities = _.concat(type.priorities, prioritiesToAdd);
              type.save(done);
            },
            function () {
              next(null);
            }
          );
        });
      },
    ],
    callback
  );
}

function mailTemplates(callback) {
  var newTicket = require('./json/mailer-new-ticket');
  var passwordReset = require('./json/mailer-password-reset');
  var templateSchema = require('../models/template');
  async.parallel(
    [
      function (done) {
        templateSchema.findOne({ name: newTicket.name }, function (err, templates) {
          if (err) return done(err);
          if (!templates || templates.length < 1) {
            return templateSchema.create(newTicket, done);
          }

          return done();
        });
      },
      function (done) {
        templateSchema.findOne({ name: passwordReset.name }, function (err, templates) {
          if (err) return done(err);
          if (!templates || templates.length < 1) {
            return templateSchema.create(passwordReset, done);
          }

          return done();
        });
      },
    ],
    callback
  );
}

function elasticSearchConfToDB(callback) {
  const nconf = require('nconf');
  const elasticsearch = {
    enable: nconf.get('elasticsearch:enable') || false,
    host: nconf.get('elasticsearch:host') || 'localhost',
    port: nconf.get('elasticsearch:port') || 9200,
  };

  nconf.set('elasticsearch', {});

  async.parallel(
    [
      function (done) {
        nconf.save(done);
      },
      function (done) {
        // if (!elasticsearch.enable) return done()
        SettingsSchema.getSettingByName('es:enable', function (err, setting) {
          if (err) return done(err);
          if (!setting) {
            SettingsSchema.create(
              {
                name: 'es:enable',
                value: elasticsearch.enable,
              },
              done
            );
          } else done();
        });
      },
      function (done) {
        if (!elasticsearch.host) elasticsearch.host = 'localhost';
        SettingsSchema.getSettingByName('es:host', function (err, setting) {
          if (err) return done(err);
          if (!setting) {
            SettingsSchema.create(
              {
                name: 'es:host',
                value: elasticsearch.host,
              },
              done
            );
          } else done();
        });
      },
      function (done) {
        if (!elasticsearch.port) return done();
        SettingsSchema.getSettingByName('es:port', function (err, setting) {
          if (err) return done(err);
          if (!setting) {
            SettingsSchema.create(
              {
                name: 'es:port',
                value: elasticsearch.port,
              },
              done
            );
          } else done();
        });
      },
    ],
    callback
  );
}

function installationID(callback) {
  const Chance = require('chance');
  const chance = new Chance();

  SettingsSchema.getSettingByName('gen:installid', function (err, setting) {
    if (err) {
      winston.error('Error getting setting: ' + err.message);
      return callback(err);
    }

    if (!setting) {
      // Setting does not exist, create it
      SettingsSchema.create(
        {
          name: 'gen:installid',
          value: chance.guid(),
        },
        function (err, createdSetting) {
          if (err) {
            winston.error('Error creating setting: ' + err.message);
            return callback(err);
          }
          winston.info('Setting created: ' + JSON.stringify(createdSetting));
          callback(null, createdSetting);
        }
      );
    } else {
      // Setting already exists, return without creating a new one
      winston.info('Setting already exists: ' + JSON.stringify(setting));
      callback(null, setting);
    }
  });
}

function maintenanceModeDefault(callback) {
  SettingsSchema.getSettingByName('maintenanceMode:enable', function (err, setting) {
    if (err) {
      // Handle and log the error
      console.error('Error getting maintenance mode setting:', err);
      return callback(err);
    }

    if (!setting) {
      // Setting doesn't exist, create it
      SettingsSchema.create(
        {
          name: 'maintenanceMode:enable',
          value: false,
        },
        function (err, createdSetting) {
          if (err) {
            // Handle and log the error
            console.error('Error creating maintenance mode setting:', err);
            return callback(err);
          }
          // Log that the setting has been created
          console.log('Maintenance mode setting created:', createdSetting);
          // Callback with the created setting
          return callback(null, createdSetting);
        }
      );
    } else {
      // Setting already exists, return without creating a new one
      return callback(null, setting);
    }
  });
}

function addDefaultTeamAndAdmin(callback) {
  const db = require('../database');
  const Chance = require('chance');
  const roleSchema = require('../models/role');
  const roleOrderSchema = require('../models/roleorder');
  const UserSchema = require('../models/user');
  const GroupSchema = require('../models/group');
  const Counters = require('../models/counters');
  const TicketTypeSchema = require('../models/tickettype');
  const TicketStatusSchema = require('../models/ticketStatus');
  const SettingsSchema = require('../models/setting');

  // const data = req.body
  const data = {
    // please make this body
    mongo: {
      host: 'localhost',
      port: '27017',
      database: 'trudesk',
      password: '#TruDesk1$',
      username: 'trudesk',
    },
    account: {
      username: 'admin',
      password: 'Admin@123',
      passconfirm: 'Admin@123',
      email: 'admin@gmail.com',
      fullname: 'admin',
    },
    elastic: {
      enable: false,
      host: 'localhost',
      port: '9200',
    },
  };

  // Mongo
  const host = data['mongo[host]'];
  const port = data['mongo[port]'];
  const database = data['mongo[database]'];
  const username = data['mongo[username]'];
  const password = data['mongo[password]'];

  // ElasticSearch
  let eEnabled = data['elastic[enable]'];
  if (typeof eEnabled === 'string') eEnabled = eEnabled.toLowerCase() === 'true';

  const eHost = data['elastic[host]'];
  const ePort = data['elastic[port]'];

  // Account
  // const user = {
  //   username: data['account[username]'],
  //   password: data['account[password]'],
  //   passconfirm: data['account[cpassword]'],
  //   email: data['account[email]'],
  //   fullname: data['account[fullname]'],
  // };

  // const dbPassword = encodeURIComponent(password);
  // let conuri = 'mongodb://' + username + ':' + dbPassword + '@' + host + ':' + port + '/' + database
  const conuri = 'mongodb://mongo:27017/';
  // if (port === '---') conuri = 'mongodb+srv://' + username + ':' + dbPassword + '@' + host + '/' + database;

  async.waterfall(
    [
      function (next) {
        winston.info('function 1');
        db.init(function (err) {
          return next(err);
        }, conuri);
      },
      function (next) {
        winston.info('function 2');
        const s = new SettingsSchema({
          name: 'gen:version',
          value: require('../../package.json').version,
        });

        return s.save(function (err) {
          return next(err);
        });
      },
      function (next) {
        winston.info('function 3');
        // if (!eEnabled) return next()
        async.parallel(
          [
            function (done) {
              SettingsSchema.create(
                {
                  name: 'es:enable',
                  value: typeof eEnabled === 'undefined' ? false : eEnabled,
                },
                done
              );
            },
            function (done) {
              if (!eHost) return done();
              SettingsSchema.create(
                {
                  name: 'es:host',
                  value: eHost,
                },
                done
              );
            },
            function (done) {
              if (!ePort) return done();
              SettingsSchema.create(
                {
                  name: 'es:port',
                  value: ePort,
                },
                done
              );
            },
          ],
          function (err) {
            return next(err);
          }
        );
      },
      function (next) {
        winston.info('function 4');
        const Counter = new Counters({
          _id: 'tickets',
          next: 1001,
        });

        Counter.save(function (err) {
          return next(err);
        });
      },
      function (next) {
        winston.info('function 5');
        const Counter = new Counters({
          _id: 'reports',
          next: 1001,
        });

        Counter.save(function (err) {
          return next(err);
        });
      },
      function (next) {
        winston.info('function 6');
        TicketStatusSchema.create(
          [
            {
              name: 'New',
              htmlColor: '#29b955',
              uid: 0,
              order: 0,
              isResolved: false,
              slatimer: true,
              isLocked: true,
            },
            {
              name: 'Open',
              htmlColor: '#d32f2f',
              uid: 1,
              order: 1,
              isResolved: false,
              slatimer: true,
              isLocked: true,
            },
            {
              name: 'Pending',
              htmlColor: '#2196F3',
              uid: 2,
              order: 2,
              isResolved: false,
              slatimer: false,
              isLocked: true,
            },
            {
              name: 'Closed',
              htmlColor: '#CCCCCC',
              uid: 3,
              order: 3,
              isResolved: true,
              slatimer: false,
              isLocked: true,
            },
          ],
          function (err) {
            if (err) return next(err);

            return next();
          }
        );
      },
      function (next) {
        winston.info('function 7');
        Counters.setCounter('status', 4, function (err) {
          if (err) return next(err);

          return next();
        });
      },
      function (next) {
        winston.info('function 8');
        const type = new TicketTypeSchema({
          name: 'Issue',
        });

        type.save(function (err) {
          return next(err);
        });
      },
      function (next) {
        winston.info('function 9');
        const type = new TicketTypeSchema({
          name: 'Grievance',
        });

        type.save(function (err) {
          return next(err);
        });
      },
      function (next) {
        winston.info('function 10');
        GroupSchema.create({ name: 'Default Group' }, function (err) {
          if (err) return next(err);
          return next();
        });
      },
      function (next) {
        function updateOrCreateRole(name, description, grants, callback) {
          roleSchema.findOneAndUpdate(
            { name: name },
            {
              description: description,
              grants: grants,
            },
            { new: true, upsert: true },
            function (err, role) {
              if (err) {
                winston.error('Error updating/creating ' + name + ' role: ' + err.message);
                return callback(err);
              }
              // winston.info(name + ' role updated or created: ' + JSON.stringify(role));
              callback(null, role);
            }
          );
        }
        winston.info('function 11');
        const roleResults = {};

        async.parallel(
          [
            function (done) {
              updateOrCreateRole('Admin', 'Default role for admins', roleDefaults.adminGrants, function (err, role) {
                if (err) return done(err);
                roleResults.adminRole = role;
                done();
              });
            },
            function (done) {
              updateOrCreateRole(
                'Support',
                'Default role for agents',
                roleDefaults.supportGrants,
                function (err, role) {
                  if (err) return done(err);
                  roleResults.supportRole = role;
                  done();
                }
              );
            },
            function (done) {
              updateOrCreateRole('User', 'Default role for users', roleDefaults.userGrants, function (err, role) {
                if (err) return done(err);
                roleResults.userRole = role;
                done();
              });
            },
          ],
          function (err) {
            if (err) {
              winston.error('Error in async.parallel: ' + err.message);
            }
            return next(err, roleResults);
          }
        );
      },
      function (role, next) {
        winston.info('function 12');
        const TeamSchema = require('../models/team');
        TeamSchema.create(
          {
            name: 'Support (Default)',
            members: [],
          },
          function (err, team) {
            if (err) {
              winston.info(err);
              winston.info(JSON.stringify(team));
            }
            return next(err, team, role);
          }
        );
      },
      function (defaultTeam, role, next) {
        winston.info('function 13');
        // const Chance = require('Chance');
        // const RoleSchema = require('../models/role');
        const UserSchema = require('../models/user');
        const user = {
          username: 'admin',
          password: 'Admin@123',
          passconfirm: 'Admin@123',
          email: 'admin@gmail.com',
          fullname: 'admin',
        };
        // const role = RoleSchema.getRoleByName('Admin');
        winston.info(JSON.stringify(role));
        UserSchema.getUserByUsername(user.username, function (err, admin) {
          if (err) {
            winston.error('Database Error: ' + err.message);
            return next('Database Error: ' + err.message);
          }

          if (!_.isNull(admin) && !_.isUndefined(admin) && !_.isEmpty(admin)) {
            return next('Username: ' + user.username + ' already exists.');
          }

          if (user.password !== user.passconfirm) {
            return next('Passwords do not match!');
          }

          const chance = new Chance();
          const adminUser = new UserSchema({
            username: user.username,
            password: user.password,
            fullname: user.fullname,
            email: user.email,
            role: role.adminRole._id,
            title: 'Administrator',
            accessToken: chance.hash(),
          });

          // adminUser.save();

          adminUser.save(function (err, savedUser) {
            if (err) {
              winston.info('error>>>>>>>>>>>>1');
              winston.error('Database Error: ' + err.message);
              return next('Database Error: ' + err.message);
            }

            defaultTeam.addMember(savedUser._id, function (err, success) {
              if (err) {
                winston.info('error>>>>>>>>>>>>2');
                winston.error('Database Error: ' + err.message);
                return next('Database Error: ' + err.message);
              }

              if (!success) {
                winston.info('error>>>>>>>>>>>>3');
                return next('Unable to add user to Administrator group!');
              }

              // Save the team only after adding the member
              defaultTeam.save(function (err) {
                if (err) {
                  winston.info('error>>>>>>>>>>>>4');
                  winston.error('Database Error: ' + err.message);
                }

                return next(err, defaultTeam);
              });
            });
          });
        });
      },
      function (defaultTeam, next) {
        winston.info('function 14');
        const DepartmentSchema = require('../models/department');

        if (!defaultTeam || !defaultTeam._id) {
          const errorMessage = 'Invalid defaultTeam object or missing _id property';
          winston.error(errorMessage);
          return next(errorMessage);
        }

        DepartmentSchema.create(
          {
            name: 'Support - All Groups (Default)',
            teams: [defaultTeam._id],
            allGroups: true,
            groups: [],
          },
          function (err) {
            if (err) {
              winston.error('Error creating Department: ' + err.message);
              return next(err);
            }
            return next();
          }
        );
      },
      function (next) {
        winston.info('function 15');
        // if (!process.env.TRUDESK_DOCKER) return next();
        const S = require('../models/setting');
        const installed = new S({
          name: 'installed',
          value: true,
        });

        installed.save(function (err) {
          if (err) {
            winston.error('DB Error: ' + err.message);
            return next('DB Error: ' + err.message);
          }

          return next();
        });
      },
      function (next) {
        winston.info('function 16');
        // if (process.env.TRUDESK_DOCKER) return next();
        // Write Configfile
        const fs = require('fs');
        const configFile = path.join(__dirname, '../../config.yml');
        const chance = new Chance();
        const YAML = require('yaml');

        const conf = {
          mongo: {
            host: host,
            port: port,
            username: username,
            password: password,
            database: database,
            shard: port === '---',
          },
          tokens: {
            secret: chance.hash() + chance.md5(),
            expires: 900, // 15min
          },
        };

        fs.writeFile(configFile, YAML.stringify(conf), function (err) {
          if (err) {
            winston.error('FS Error: ' + err.message);
            return next('FS Error: ' + err.message);
          }

          return next(null);
        });
      },
    ],
    callback
  );
}
settingsDefaults.init = function (callback) {
  winston.debug('Checking Default Settings...');
  async.series(
    [
      function (done) {
        winston.debug('roles1');
        return createDirectories(done);
      },
      function (done) {
        winston.debug('roles2');
        return downloadWin32MongoDBTools(done);
      },
      function (done) {
        winston.debug('roles3');
        return rolesDefault(done);
      },
      function (done) {
        winston.debug('roles4');
        return defaultUserRole(done);
      },
      function (done) {
        winston.debug('roles5');
        return timezoneDefault(done);
      },
      function (done) {
        winston.debug('roles12');
        return addDefaultTeamAndAdmin(done);
      },
      function (done) {
        winston.debug('roles6');
        return ticketTypeSettingDefault(done);
      },
      function (done) {
        winston.debug('roles7');
        return ticketPriorityDefaults(done);
      },
      function (done) {
        winston.debug('roles8');
        return addedDefaultPrioritiesToTicketTypes(done);
      },
      function (done) {
        winston.debug('roles9');
        return checkPriorities(done);
      },
      function (done) {
        winston.debug('roles10');
        return normalizeTags(done);
      },
      function (done) {
        winston.debug('roles11');
        return mailTemplates(done);
      },
      function (done) {
        winston.debug('roles13');
        return elasticSearchConfToDB(done);
      },
      function (done) {
        winston.debug('roles14');
        return maintenanceModeDefault(done);
      },
      function (done) {
        winston.debug('roles15');
        return installationID(done);
      },
    ],
    function (err) {
      if (err) {
        winston.info('erororororoororororo>>>>>>>>>>>>>>>>>>');
        winston.warn(err);
      }
      if (_.isFunction(callback)) return callback();
    }
  );
};

module.exports = settingsDefaults;
