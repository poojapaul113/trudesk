/* eslint-disable object-shorthand */
/* eslint-disable no-var */
/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/*
 *       .                             .o8                     oooo
 *    .o8                             "888                     `888
 *  .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
 *    888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
 *    888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
 *    888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
 *    "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 *  ========================================================================
 *  Author:     Chris Brame
 *  Updated:    2/18/19 5:59 PM
 *  Copyright (c) 2014-2019. All rights reserved.
 */

const packagejson = require('../../../../package');

module.exports = function (middleware, router, controllers) {
  // Shorten consts
  const apiv1 = middleware.api;
  const isAdmin = middleware.isAdmin;
  const isAgent = middleware.isAgent;
  const isAgentOrAdmin = middleware.isAgentOrAdmin;
  const canUser = middleware.canUser;
  const apiCtrl = controllers.api.v1;

  // Common
  router.get('/api', controllers.api.index);
  router.get('/api/v1/version', (req, res) => {
    return res.json({ version: packagejson.version });
  });
  router.post('/api/v1/login', apiCtrl.common.login);
  router.get('/api/v1/login', apiv1, apiCtrl.common.getLoggedInUser);
  router.get('/api/v1/logout', apiv1, apiCtrl.common.logout);
  router.get('/api/v1/privacypolicy', apiCtrl.common.privacyPolicy);

  router.post('/api/v1/adapter/user/create', async (req, res) => {
    try {
      var async = require('async');
      var _ = require('lodash');
      var groupSchema = require('../../../models/group');
      var roleSchmea = require('../../../models/role');
      var SettingUtil = require('../../../settings/settingsUtil');
      var UserSchema = require('../../../models/user');
      var TeamSchema = require('../../../models/team');

      const response = {};
      response.success = true;

      const postData = req.body;

      const role_data = await roleSchmea.find({});

      postData.aRole = role_data[0]._id;

      if (_.isUndefined(postData) || !_.isObject(postData)) {
        return res.status(400).json({ success: false, error: 'Invalid Post Data' });
      }

      const propCheck = ['username', 'password', 'confirmPassword', 'fullname', 'email', 'aRole'];

      if (
        !_.every(propCheck, function (x) {
          return x in postData;
        })
      ) {
        return res.status(400).json({ success: false, error: 'Invalid Post Data' });
      }

      if (postData.password !== postData.confirmPassword)
        return res.status(400).json({ success: false, error: 'Invalid Password Match' });

      await SettingUtil.getSettings(function (err, content) {
        if (err) return res.status(400).json({ success: false, error: err.message });
        const settings = content.data.settings;
        if (settings.accountsPasswordComplexity.value) {
          const passwordComplexity = require('../../../settings/passwordComplexity');
          if (!passwordComplexity.validate(postData.password))
            return res.status(400).json({ success: false, error: 'Password does not meet minimum requirements.' });
        }
      });

      const admin = await UserSchema.findOne({ username: postData.username });

      if (!_.isNull(admin) && !_.isUndefined(admin) && !_.isEmpty(admin)) {
        return res.status(400).json({ success: false, error: 'Username: ' + postData.username + ' already exists.' });
      }
      var Chance = require('chance');
      const chance = new Chance();
      const adminUser = new UserSchema({
        username: postData.username,
        password: postData.password,
        fullname: postData.fullname,
        email: postData.email,
        role: postData.aRole,
        title: postData.title,
        accessToken: chance.hash(),
      });

      var Group = new groupSchema();

      Group.name = `${postData.username} Group`;
      Group.members = [adminUser._id];
      Group.sendMailTo = [adminUser._id];

      const admin_data = await adminUser.save();
      const group_data = await Group.save();
      return res.status(200).json({
        message: 'user registered',
        admin: admin_data,
        group: group_data,
      });
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }
  });

  // Roles
  router.get('/api/v1/roles', apiv1, apiCtrl.roles.get);
  router.post('/api/v1/roles', apiv1, isAdmin, apiCtrl.roles.create);
  router.put('/api/v1/roles/:id', apiv1, isAdmin, apiCtrl.roles.update);
  router.delete('/api/v1/roles/:id', apiv1, isAdmin, apiCtrl.roles.delete);

  // Tickets
  router.get('/api/v1/tickets', apiv1, canUser('tickets:view'), apiCtrl.tickets.get);
  router.get('/api/v1/adapter/user/tickets', async (req, res) => {
    try {
      var ticketModel = require('../../../models/ticket');
      var ticketStatusSchema = require('../../../models/ticketStatus');
      var UserSchema = require('../../../models/user');

      const auth_header = req.headers.accesstoken;
      const user = await UserSchema.findOne({ accessToken: auth_header });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'UnAuthorised',
        });
      }

      const limit = parseInt(req.query.limit) || 10;
      const page = parseInt(req.query.page) || 0;

      const statuses = await ticketStatusSchema.find({ isResolved: false });
      const tickets = await ticketModel
        .find({
          owner: user._id,
        })
        .limit(limit)
        .skip(page);

      return res.status(200).json({
        success: true,
        user: user,
        tickets,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  router.get('/api/v1/tickets/group/:id', apiv1, isAdmin, canUser('tickets:view'), apiCtrl.tickets.getByGroup);
  router.get('/api/v1/tickets/search', apiv1, canUser('tickets:view'), apiCtrl.tickets.search);
  router.post('/api/v1/tickets/create', apiv1, canUser('tickets:create'), apiCtrl.tickets.create);
  router.get('/api/v1/tickets/type/:id', apiv1, apiCtrl.tickets.getType);
  router.post('/api/v1/tickets/type/:id/removepriority', apiv1, isAdmin, apiCtrl.tickets.typeRemovePriority);
  router.post('/api/v1/tickets/type/:id/addpriority', apiv1, isAdmin, apiCtrl.tickets.typeAddPriority);
  router.get('/api/v1/tickets/types', apiv1, apiCtrl.tickets.getTypes);
  router.post('/api/v1/tickets/types/create', apiv1, isAdmin, apiCtrl.tickets.createType);
  router.put('/api/v1/tickets/types/:id', apiv1, isAdmin, apiCtrl.tickets.updateType);
  router.put('/api/v1/tickets/tickettype/:ticketid', apiv1, isAdmin, apiCtrl.tickets.updateTicketType);

  router.delete('/api/v1/tickets/types/:id', apiv1, isAdmin, apiCtrl.tickets.deleteType);
  router.post('/api/v1/tickets/priority/create', apiv1, isAdmin, apiCtrl.tickets.createPriority);
  router.post('/api/v1/tickets/priority/:id/delete', apiv1, isAdmin, apiCtrl.tickets.deletePriority);
  router.get('/api/v1/tickets/priorities', apiv1, apiCtrl.tickets.getPriorities);
  router.put('/api/v1/tickets/priority/:id', apiv1, isAdmin, apiCtrl.tickets.updatePriority);

  router.post('/api/v1/tickets/status/create', apiv1, isAdmin, apiCtrl.tickets.createStatus);
  router.get('/api/v1/tickets/status', apiv1, apiCtrl.tickets.getStatus);
  router.put('/api/v1/tickets/status/order', apiv1, isAdmin, apiCtrl.tickets.updateStatusOrder);
  router.put('/api/v1/tickets/status/:id', apiv1, isAdmin, apiCtrl.tickets.updateStatus);
  router.post('/api/v1/tickets/status/:id/delete', apiv1, isAdmin, apiCtrl.tickets.deleteStatus);

  router.get('/api/v1/tickets/overdue', apiv1, canUser('tickets:view'), apiCtrl.tickets.getOverdue);
  router.post('/api/v1/tickets/addcomment', apiv1, canUser('comments:create'), apiCtrl.tickets.postComment);
  router.post('/api/v1/tickets/addnote', apiv1, canUser('tickets:notes'), apiCtrl.tickets.postInternalNote);
  router.get('/api/v1/tickets/tags', apiv1, apiCtrl.tickets.getTags);
  router.get('/api/v1/tickets/count/tags', apiv1, apiCtrl.tickets.getTagCount);
  router.get('/api/v1/tickets/count/tags/:timespan', apiv1, apiCtrl.tickets.getTagCount);
  router.get('/api/v1/tickets/count/days', apiv1, apiCtrl.tickets.getTicketStats);
  router.get('/api/v1/tickets/count/days/:timespan', apiv1, apiCtrl.tickets.getTicketStats);
  router.get('/api/v1/tickets/count/topgroups', apiv1, apiCtrl.tickets.getTopTicketGroups);
  router.get('/api/v1/tickets/count/topgroups/:top', apiv1, apiCtrl.tickets.getTopTicketGroups);
  router.get('/api/v1/tickets/count/topgroups/:timespan/:top', apiv1, apiCtrl.tickets.getTopTicketGroups);
  router.get(
    '/api/v1/tickets/count/group/:id',
    apiv1,
    isAgentOrAdmin,
    canUser('tickets:view'),
    apiCtrl.tickets.getCountByGroup
  );
  router.get('/api/v1/tickets/stats', apiv1, apiCtrl.tickets.getTicketStats);
  router.get('/api/v1/tickets/stats/group/:group', apiv1, apiCtrl.tickets.getTicketStatsForGroup);
  router.get('/api/v1/tickets/stats/user/:user', apiv1, apiCtrl.tickets.getTicketStatsForUser);
  router.get('/api/v1/tickets/stats/:timespan', apiv1, apiCtrl.tickets.getTicketStats);
  router.get('/api/v1/tickets/deleted', apiv1, isAdmin, apiCtrl.tickets.getDeletedTickets);
  router.post('/api/v1/tickets/deleted/restore', apiv1, isAdmin, apiCtrl.tickets.restoreDeleted);
  router.get('/api/v1/tickets/:uid', apiv1, canUser('tickets:view'), apiCtrl.tickets.single);
  router.get(
    '/api/v1/ticketDetails/:transaction_id',
    apiv1,
    canUser('tickets:view'),
    apiCtrl.tickets.singleTicketByTransaction
  );
  router.put('/api/v1/tickets/:id', apiv1, canUser('tickets:update'), apiCtrl.tickets.update);
  router.delete('/api/v1/tickets/:id', apiv1, canUser('tickets:delete'), apiCtrl.tickets.delete);
  router.put('/api/v1/tickets/:id/subscribe', apiv1, apiCtrl.tickets.subscribe);
  router.delete(
    '/api/v1/tickets/:tid/attachments/remove/:aid',
    canUser('tickets:update'),
    apiv1,
    apiCtrl.tickets.removeAttachment
  );

  // Tags
  router.get('/api/v1/count/tags', middleware.api, function (req, res) {
    const tagSchema = require('../../../models/tag');
    tagSchema.countDocuments({}, function (err, count) {
      if (err) return res.status(500).json({ success: false, error: err });

      return res.json({ success: true, count: count });
    });
  });

  router.post('/api/v1/tags/create', apiv1, apiCtrl.tags.createTag);
  router.get('/api/v1/tags/limit', apiv1, apiCtrl.tags.getTagsWithLimit);
  router.put('/api/v1/tags/:id', apiv1, isAgentOrAdmin, apiCtrl.tags.updateTag);
  router.delete('/api/v1/tags/:id', apiv1, isAgentOrAdmin, apiCtrl.tags.deleteTag);

  // Public Tickets
  const checkCaptcha = middleware.checkCaptcha;
  const checkOrigin = middleware.checkOrigin;

  router.post('/api/v1/public/users/checkemail', checkCaptcha, checkOrigin, apiCtrl.users.checkEmail);
  router.post('/api/v1/public/tickets/create', checkCaptcha, checkOrigin, apiCtrl.tickets.createPublicTicket);
  router.post('/api/v1/public/account/create', checkCaptcha, checkOrigin, apiCtrl.users.createPublicAccount);

  // Groups
  router.get('/api/v1/groups', apiv1, apiCtrl.groups.get);
  router.get('/api/v1/groups/all', apiv1, canUser('groups:view'), apiCtrl.groups.getAll);
  router.post('/api/v1/groups/create', apiv1, canUser('groups:create'), apiCtrl.groups.create);
  router.get('/api/v1/groups/:id', apiv1, apiCtrl.groups.getSingleGroup);
  router.put('/api/v1/groups/:id', apiv1, canUser('groups:update'), apiCtrl.groups.updateGroup);
  router.delete('/api/v1/groups/:id', apiv1, canUser('groups:delete'), apiCtrl.groups.deleteGroup);

  // Users
  router.put('/api/v1/profile', apiv1, apiCtrl.users.profileUpdate);
  router.get('/api/v1/users', apiv1, canUser('accounts:view'), apiCtrl.users.getWithLimit);
  router.post('/api/v1/users/create', apiv1, canUser('accounts:create'), apiCtrl.users.create);
  router.get('/api/v1/users/notifications', apiv1, apiCtrl.users.getNotifications);
  router.get('/api/v1/users/notificationCount', apiv1, apiCtrl.users.notificationCount);
  router.get('/api/v1/users/getassignees', apiv1, isAgentOrAdmin, apiCtrl.users.getAssingees);
  router.get('/api/v1/users/:username', apiv1, canUser('accounts:view'), apiCtrl.users.single);
  router.put('/api/v1/users/:username', apiv1, canUser('accounts:update'), apiCtrl.users.update);
  router.get('/api/v1/users/:username/groups', apiv1, apiCtrl.users.getGroups);
  router.put('/api/v1/users/:username/updatepreferences', apiv1, apiCtrl.users.updatePreferences);
  router.get('/api/v1/users/:username/enable', apiv1, canUser('accounts:update'), apiCtrl.users.enableUser);
  router.delete('/api/v1/users/:username', apiv1, canUser('accounts:delete'), apiCtrl.users.deleteUser);
  router.post('/api/v1/users/:id/generateapikey', apiv1, apiCtrl.users.generateApiKey);
  router.post('/api/v1/users/:id/removeapikey', apiv1, apiCtrl.users.removeApiKey);
  router.post('/api/v1/users/:id/generatel2auth', apiv1, middleware.csrfCheck, apiCtrl.users.generateL2Auth);
  router.post('/api/v1/users/:id/removel2auth', apiv1, middleware.csrfCheck, apiCtrl.users.removeL2Auth);

  // Messages
  router.get('/api/v1/messages', apiv1, apiCtrl.messages.get);
  router.post('/api/v1/messages/conversation/start', apiv1, apiCtrl.messages.startConversation);
  router.get('/api/v1/messages/conversation/:id', apiv1, apiCtrl.messages.getMessagesForConversation);
  router.delete('/api/v1/messages/conversation/:id', apiv1, apiCtrl.messages.deleteConversation);
  router.get('/api/v1/messages/conversations', apiv1, apiCtrl.messages.getConversations);
  router.get('/api/v1/messages/conversations/recent', apiv1, apiCtrl.messages.getRecentConversations);
  router.post('/api/v1/messages/send', apiv1, apiCtrl.messages.send);

  // Notices
  router.post('/api/v1/notices/create', apiv1, canUser('notices:create'), apiCtrl.notices.create);
  router.get('/api/v1/notices/clearactive', apiv1, canUser('notices:deactivate'), apiCtrl.notices.clearActive);
  router.put('/api/v1/notices/:id', apiv1, canUser('notices:update'), apiCtrl.notices.updateNotice);
  router.delete('/api/v1/notices/:id', apiv1, canUser('notices:delete'), apiCtrl.notices.deleteNotice);

  // Reports Generator
  const reportsGenCtrl = apiCtrl.reports.generate;
  const genBaseUrl = '/api/v1/reports/generate/';
  router.post(genBaseUrl + 'tickets_by_group', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByGroup);
  router.post(genBaseUrl + 'tickets_by_status', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByStatus);
  router.post(genBaseUrl + 'tickets_by_priority', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByPriority);
  router.post(genBaseUrl + 'tickets_by_tags', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByTags);
  router.post(genBaseUrl + 'tickets_by_type', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByType);
  router.post(genBaseUrl + 'tickets_by_user', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByUser);
  router.post(genBaseUrl + 'tickets_by_assignee', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByAssignee);
  router.post(genBaseUrl + 'tickets_by_team', apiv1, canUser('reports:create'), reportsGenCtrl.ticketsByTeam);

  // Settings
  router.get('/api/v1/settings', apiv1, apiCtrl.settings.getSettings);
  router.put('/api/v1/settings', apiv1, isAdmin, apiCtrl.settings.updateSetting);
  router.post('/api/v1/settings/testmailer', apiv1, isAdmin, apiCtrl.settings.testMailer);
  router.put('/api/v1/settings/mailer/template/:id', apiv1, isAdmin, apiCtrl.settings.updateTemplateSubject);
  router.get('/api/v1/settings/buildsass', apiv1, isAdmin, apiCtrl.settings.buildsass);
  router.put('/api/v1/settings/updateroleorder', apiv1, isAdmin, apiCtrl.settings.updateRoleOrder);

  // Backups
  router.get('/api/v1/backups', apiv1, isAdmin, controllers.backuprestore.getBackups);
  router.post('/api/v1/backup', apiv1, isAdmin, controllers.backuprestore.runBackup);
  router.delete('/api/v1/backup/:backup', apiv1, isAdmin, controllers.backuprestore.deleteBackup);
  router.post('/api/v1/backup/restore', apiv1, isAdmin, controllers.backuprestore.restoreBackup);
  router.post('/api/v1/backup/upload', apiv1, isAdmin, controllers.backuprestore.uploadBackup);
  router.get('/api/v1/backup/hastools', apiv1, isAdmin, controllers.backuprestore.hasBackupTools);

  // Editor

  router.get('/api/v1/editor/load/:id', apiv1, isAdmin, controllers.editor.load);
  router.post('/api/v1/editor/save', apiv1, isAdmin, controllers.editor.save);
  router.get('/api/v1/editor/assets', apiv1, isAdmin, controllers.editor.getAssets);
  router.post('/api/v1/editor/assets/remove', apiv1, isAdmin, controllers.editor.removeAsset);
  router.post('/api/v1/editor/assets/upload', apiv1, isAdmin, controllers.editor.assetsUpload);

  // Issues
  router.post('/api/v1/issue/save', apiv1, apiCtrl.issues.create);
  router.get('/api/v1/issue/:transaction_id', apiv1, async (req, res) => {
    try {
      var issueModel = require('../../../models/issue');
      // var UserSchema = require('../../../models/user');

      // const auth_header = req.headers.accesstoken;
      // const user = await UserSchema.findOne({ accessToken: auth_header });

      // if (!user) {
      //   return res.status(401).json({
      //     success: false,
      //     error: 'UnAuthorised',
      //   });
      // }
      const issue = await issueModel.findOne({
        transaction_id: req.params.transaction_id,
        // userId: user._id,
      });

      if (!issue) {
        return res.status(401).json({
          success: false,
          error: 'No issue found for this user and transaction_id',
        });
      }

      return res.status(200).json({
        success: true,
        issue,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });

  router.patch('/api/v1/issue/:transaction_id', apiv1, async (req, res) => {
    try {
      var issueModel = require('../../../models/issue');
      // var UserSchema = require('../../../models/user');

      // const auth_header = req.headers.accesstoken;
      // const user = await UserSchema.findOne({ accessToken: auth_header });

      // if (!user) {
      //   return res.status(401).json({
      //     success: false,
      //     error: 'UnAuthorised',
      //   });
      // }
      const issue = await issueModel.updateOne(
        {
          transaction_id: req.params.transaction_id,
        },
        {
          issue_status: req.query.status,
        }
      );

      return res.status(200).json({
        success: true,
        issue,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
};
