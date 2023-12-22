/* eslint-disable camelcase */
/* eslint-disable no-var */
/* eslint-disable object-shorthand */
var winston = require('../../../logger');

const apiIssues = {};

apiIssues.create = async function (req, res) {
  const IssueSchema = require('../../../models/issue');
  var UserSchema = require('../../../models/user');
  const issueSchema = req.body;
  const auth_header = req.headers.accesstoken;
  const user = await UserSchema.findOne({ accessToken: auth_header });

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'UnAuthorised',
    });
  }

  issueSchema.userId = user._id;
  winston.warn('Public account creation was attempted while disabled!', issueSchema);

  // Issue Creation
  const issue = new IssueSchema({
    ...issueSchema,
  });

  issue.save(function (err, issue) {
    if (err) return res.status(400).json({ success: false, error: 'Error: ' + err.message });

    res.json({ success: true, error: null, issue: issue });
  });
};

module.exports = apiIssues;
