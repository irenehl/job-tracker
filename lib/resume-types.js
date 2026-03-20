/**
 * @typedef {object} TailoredExperience
 * @property {string} employer
 * @property {string} title
 * @property {string} dates
 * @property {string} location
 * @property {string[]} bullets
 */

/**
 * @typedef {object} TailoredProject
 * @property {string} name
 * @property {string[]} bullets
 */

/**
 * @typedef {object} TailoredEducation
 * @property {string} school
 * @property {string} degree
 * @property {string} dates
 * @property {string} detail
 */

/**
 * @typedef {object} TailoredResume
 * @property {string} yourName
 * @property {string} contactLine — location and email(s), pipe-separated; omit phone (plain text). Header: location on its own line; email on the links line with URLs from linksDisplay.
 * @property {string} targetHeadline — normalized to **Software Engineer** for export (model output overwritten)
 * @property {string} summary
 * @property {string} skills
 * @property {TailoredExperience[]} experience
 * @property {TailoredProject[]} projects
 * @property {TailoredEducation[]} education
 * @property {string} [linksDisplay] — optional newline-separated "Label: https://..." lines; inlined into the header row in DOCX (hyperlinks) and Markdown
 * @property {string} [languagesLine] — optional e.g. "English - Working knowledge" (from profile)
 */

/**
 * @typedef {object} ValidationScores
 * @property {number} ats
 * @property {number} relevance
 * @property {number} grounding
 * @property {number} tone
 * @property {number} clarity
 */

/**
 * @typedef {object} ValidationResult
 * @property {ValidationScores} scores
 * @property {'ok' | 'revise' | 'fail'} severity
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {string[]} blocking
 * @property {string[]} aiToneFlags
 * @property {boolean} reviseRecommended
 */

module.exports = {};
