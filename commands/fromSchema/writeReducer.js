const Parser = require('../../tools/parser');
const Cases = require('../../tools/cases');
const writeActionsInReducer = require('./writeActionsInReducer');
const {
  concat,
  transforms,
  parseCamelCaseToArray,
  printObject,
  prettify,
  ensureImport,
} = require('../../tools/utils');

module.exports = ({
  buffer,
  cases: { pascal, camel, display },
  initialState,
  actions,
}) =>
  transforms(buffer, [
    ensureImport('fromJS', 'immutable', { destructure: true }),
    /** Adds in boilerplate if domain does not exist */
    b => {
      const index = b.lastIndexOf('export default');
      let hasPayload;
      if (actions) {
        hasPayload = Object.values(actions).filter(({ set }) => {
          if (!set) return false;
          return (
            Object.values(set).filter(val => `${val}`.includes('payload'))
              .length > 0
          );
        }).length;
      }

      return concat([
        b.slice(0, index),
        `// @suit-start`,
        `/** ${display} Reducer */`,
        ``,
        `const initial${pascal}State = fromJS(${printObject(initialState)});`,
        ``,
        `export const ${camel}Reducer = (state = initial${pascal}State, { type${
          hasPayload ? ', payload' : ''
        } }) => {`,
        `  switch (type) {`,
        `    default:`,
        `      return state;`,
        `  }`,
        `};`,
        `// @suit-end`,
        ``,
        b.slice(index),
      ]);
    },
    /** Adds to combineReducers */
    b => {
      const searchTerm = 'combineReducers({';

      if (b.indexOf(searchTerm) === -1) {
        console.log(
          `ERROR`.red + `: refactor to use combineReducers in reducer.js`,
        );
        return b;
      }

      const index = b.indexOf(searchTerm) + searchTerm.length;
      return (
        concat([
          b.slice(0, index),
          `  ${camel}: ${camel}Reducer, // @suit-line`,
        ]) + b.slice(index)
      );
    },
    ensureImport('combineReducers', 'redux', { destructure: true }),
    /** Adds actions */
    b => {
      if (!actions) {
        return b;
      }
      const p = new Parser(b);
      p.resetTicker();
      p.toNext(`export const ${camel}Reducer =`);
      const searchTerm = `switch (type) {`;
      const startIndex = p.toNext(searchTerm).index + searchTerm.length;
      const { index: endIndex } = p.toNext('default:');
      let content = '';
      Object.keys(actions)
        .map(key => ({ ...actions[key], name: key }))
        .forEach(action => {
          const c = new Cases(parseCamelCaseToArray(action.name));
          const cases = c.all();

          const operations = writeActionsInReducer({
            action,
          });

          content += concat([`    case ${cases.constant}:`, operations, ``]);
        });
      return (
        concat([b.slice(0, startIndex), content]) + `    ` + b.slice(endIndex)
      );
    },
    buf => {
      if (!actions) {
        return buf;
      }
      return transforms(buf, [
        ...Object.keys(actions)
          .map(key => ({ ...actions[key], name: key }))
          .map(action => {
            const c = new Cases(parseCamelCaseToArray(action.name));
            const constant = c.constant();
            return ensureImport(constant, './constants', { destructure: true });
          }),
      ]);
    },
    prettify,
  ]);