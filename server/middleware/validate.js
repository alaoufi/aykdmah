const { validationResult } = require('express-validator');

// Import the current parser asynchronously: Vercel's CommonJS loader does not
// support require(ESM). Cache only the import, never request content.
let parserModule;
const nonTextTags = new Set(['script', 'style', 'textarea', 'option']);
const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'بيانات غير صحيحة',
      errors: errors.array().map(e => ({ field: e.path || e.param, message: e.msg })),
    });
  }
  next();
}

async function sanitizeString(input) {
  if (input == null) return input;
  if (!parserModule) parserModule = import('htmlparser2').catch(err => { parserModule = null; throw err; });
  const { Parser } = await parserModule;
  const text = [];
  let ignoredDepth = 0;
  const parser = new Parser({
    onopentag(name) { if (ignoredDepth || nonTextTags.has(name)) ignoredDepth++; },
    onclosetag() { if (ignoredDepth) ignoredDepth--; },
    ontext(value) { if (!ignoredDepth) text.push(value); },
  }, { decodeEntities: true, lowerCaseTags: true });
  parser.end(String(input));
  // No tags or attributes are emitted. Escape decoded entities so even
  // markup-shaped text remains text if another consumer renders the result.
  return escapeText(text.join('')).trim();
}

function sanitizeBody(fields) {
  return async (req, res, next) => {
    try {
      if (req.body) {
        for (const f of fields) {
          if (typeof req.body[f] === 'string') {
            req.body[f] = await sanitizeString(req.body[f]);
          }
        }
      }
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { validate, sanitizeString, sanitizeBody };
