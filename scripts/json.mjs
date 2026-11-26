// Lint does not see a JSDoc cast on an `any` value. With `unknown` here, each caller must state the type it reads.
/** @param {string} text @returns {unknown} */
export const parseJson = (text) => JSON.parse(text);
