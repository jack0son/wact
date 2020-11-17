const deepMerge = require("deepmerge");
const { isPlainObject } = require("is-plain-object");

// Merge two objects x and y deeply, returning a new merged object with the elements from both x and y.
// Merging creates a new object, so that neither x or y is modified.
// Note: By default, arrays are merged by concatenating them.
// https://www.npmjs.com/package/deepmerge
const merge = (x, y, opts) =>
  // If an element at the same key is present for both x and y, the value from y will appear in the result.
  deepMerge(x || {}, y || {}, { ...opts, isMergeableObject: isPlainObject });

module.exports = { merge };
