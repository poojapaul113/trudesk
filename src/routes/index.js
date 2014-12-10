"use strict";

var express = require('express'),
    router = express.Router(),
    controllers = require('../controllers/index.js'),
    path = require('path'),
    winston = require('winston');

var passport = require('passport');

function mainRoutes(router, middleware, controllers) {
    router.get('/', middleware.redirectToDashboardIfLoggedIn, controllers.main.index);
    router.get('/dashboard', middleware.redirectToLogin, middleware.loadCommonData, controllers.main.dashboard);

    router.get('/login', middleware.redirectToLogin, middleware.redirectToDashboardIfLoggedIn);
    router.post('/login', controllers.main.loginPost);
    router.get('/logout', controllers.main.logout);

    //Tickets
    router.get('/tickets', middleware.redirectToLogin, middleware.loadCommonData, controllers.tickets.get);
    router.get('/tickets/create', middleware.redirectToLogin, middleware.loadCommonData, controllers.tickets.create);
    router.post('/tickets/create', middleware.redirectToLogin, controllers.tickets.submitTicket);
    router.get('/tickets/edit/:id', middleware.redirectToLogin, middleware.loadCommonData, controllers.tickets.editTicket);
    router.get('/tickets/:id', middleware.redirectToLogin, middleware.loadCommonData, controllers.tickets.single);
    router.post('/tickets/postcomment', middleware.redirectToLogin, controllers.tickets.postcomment);

    //Messages
    router.get('/messages', middleware.redirectToLogin, middleware.loadCommonData, function(req, res){ res.redirect('/messages/inbox');});
    router.get('/messages/inbox', middleware.redirectToLogin, middleware.loadCommonData, controllers.messages.get);
    router.get('/messages/sentitems', middleware.redirectToLogin, middleware.loadCommonData, controllers.messages.getSentItems);
    router.get('/messages/trash', middleware.redirectToLogin, middleware.loadCommonData, controllers.messages.getTrashItems);

    router.get('/messages/:id', middleware.redirectToLogin, middleware.loadCommonData, controllers.messages.getById);

    //Servers
    router.get('/servers', middleware.redirectToLogin, middleware.loadCommonData, controllers.servers.get);

    //Accounts
    router.get('/accounts', middleware.redirectToLogin, middleware.loadCommonData, controllers.accounts.get);
    router.get('/accounts/create', middleware.redirectToLogin, middleware.loadCommonData, controllers.accounts.createAccount);
    router.post('/accounts/create', middleware.redirectToLogin, controllers.accounts.postAccount);
    router.get('/accounts/:username', middleware.redirectToLogin, middleware.loadCommonData, controllers.accounts.editAccount);

    //API
    router.get('/api', controllers.api.index);
    router.get('/api/tickets', middleware.api, controllers.api.users.get);
    router.get('/api/tickets/:id', middleware.api, controllers.api.users.get);
    router.get('/api/users', middleware.api, controllers.api.users.get);
    router.post('/api/users', controllers.api.users.insert);
}

module.exports = function(app, middleware) {
    mainRoutes(router, middleware, controllers);

    app.use('/', router);

    app.use(handle404);
    app.use(handleErrors);
};

function handleErrors(err, req, res, next) {
    winston.warn(err.stack);
    var status = err.status || 500;
    res.status(status);
    //req.flash('errorMessage', err.message);

    res.render('error', {
        message: err.message,
        error: err,
        layout: false
    });
}

function handle404(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
}