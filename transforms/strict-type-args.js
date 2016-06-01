/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * Add explicit arguments to polymorphic type application expressions,
 * based on errors from Flow >= 0.25.
 *
 * See ../README.md for instructions.
 *
 * @flow
 */

'use-strict';

// minimal API type info in lieu of full libdef
//
interface Collection {
  find(type: Object, filter?: (node: Object) => boolean): Collection;
  filter(callback: (node: Object) => boolean): Collection;
  forEach(callback: (node: Object) => void): Collection;
  replaceWith: (node: Object) => Collection;
  toSource(options?: Object): string;
}

type JSCodeShift = {
  (source: Object | Array<Object> | string): Collection,
  // node types
  GenericTypeAnnotation: Object,
  // builders
  genericTypeAnnotation: () => Object,
  typeParameterInstantiation: (args: Array<Object>) => Object,
  anyTypeAnnotation: () => Object,
}

type Options = { [key: string]: string };

type Transform = (
  fileInfo: { path: string, source: string },
  api: { jscodeshift: JSCodeShift, stats: (stat: string) => void },
  options: Options,
) => ?string;

// loaded error info
type Info = { path: string, start: number, end: number, arity: number };

// accessors for loaded errors
type ErrorAccessors = {
  getErrors: (file: string) => Array<Info>,
  hasErrors: (file: string) => boolean,
};

// extract base filename from given path
const getFileName = path => path.replace(/^.*[\\\/]/, '')

// load arity errors from given file (once per worker), return accessors
//
const loadArityErrors: (options: Options) => ErrorAccessors = function() {

  let lastErrorFileLoad: ?{
    errorFile: string,
    accessors: ErrorAccessors,
  } = null;

  const re = /Application of polymorphic type needs <list of (\d+)/;

  function matchArityError(messages) {
    let match = messages.length > 1 && messages[1].descr.match(re);
    return match ? {
      path: messages[0].path,
      start: parseInt(messages[0].loc.start.offset, 10),
      end: parseInt(messages[0].loc.end.offset, 10),
      arity: match[1],
    } : null;
  }

  return function(options) {
    const errorFile = options.errors;

    if (!errorFile) {
      console.log("no error file specified");
      return { getErrors: (file) => [], hasErrors: (file) => false };
    }

    if (lastErrorFileLoad && lastErrorFileLoad.errorFile == errorFile) {
      return lastErrorFileLoad.accessors;
    }

    const arityErrors: Map<string, Array<Info>> = new Map();

    const getErrors = (file) => arityErrors.get(file) || [];
    const hasErrors = (file) => arityErrors.has(file);

    function addArityError(info) {
      const file = getFileName(info.path);
      const errors = getErrors(file).concat([info]);
      arityErrors.set(file, errors);
    }

    let loaded = 0;
    try {
      const buffer = require('fs').readFileSync(errorFile, 'utf8');
      const flowErrors = JSON.parse(buffer);
      for (const error of flowErrors.errors) {
        const info = matchArityError(error.message);
        if (info) {
          loaded++;
          addArityError(info);
        }
      }
      console.log(`worker: loaded ${loaded} arity errors (of ${flowErrors.errors.length} total) from ${errorFile}`);
    } catch (err) {
      console.log(`worker: exception [${err}] while loading '${errorFile}', ${loaded} errors loaded`);
    }

    const accessors = { getErrors, hasErrors };
    lastErrorFileLoad = { errorFile, accessors };
    return accessors;
  }
}();

// transform
//
const transform: Transform = function(file, api, options) {

  const { jscodeshift: j, stats } = api;
  const fileName = getFileName(file.path);

  const { getErrors, hasErrors } = loadArityErrors(options);

  // extract a name from an id/qid node. qualifiers are dotted
  function getName(id) {
    switch (id.type) {
      case 'Identifier':
        return id.name;
      case 'QualifiedTypeIdentifier':
        return `${id.qualification.name}.${id.id.name}`;
      default:
        return null;
    }
  }

  // process an id or qualified id expr from a type annotation.
  // we add explicit `any` type arguments if:
  // 1. no type args are already specified
  // 2. the expr is the source of an arity error loaded with `--errors`
  //
  function process(annoPath):boolean {
    const { id, typeParameters, start, end } = annoPath.value;
    if (typeParameters) return false;

    const name: ?string = getName(id);
    if (!name) return false;

    for (const info of getErrors(fileName)) {
      // NOTE: many files may share the same base name, and we want to avoid
      // path checks to keep use of this mod from getting too fussy (consider
      // root stripping, includes, etc.). So we go ahead and do the mod if we
      // get a base name + location match, on the premise that false positives
      // will be very unlikely unless there are multiple copies of an identical
      // file, in which case we'll effectively be using the first error record
      // as a proxy for all subsequent ones, which is fine.

      if (start == info.start && end == info.end) {
        // build arglist and attach
        const params = [];
        for (let i = 0; i < info.arity; i++) {
          params.push(j.anyTypeAnnotation());
        }
        const withParams = j.genericTypeAnnotation(id,
          j.typeParameterInstantiation(params)
        );
        j(annoPath).replaceWith(withParams);

        return true;
      }
    }

    return false;
  }

  // true if annotation expr is *not* part of a typeof expression.
  // we need this to bypass conversions in `typeof Foo` exprs
  // (there `Foo` is a value expr, but it's parsed as an annotation)
  function notTypeOf(annoPath):boolean {
    let path = annoPath;
    while (path = path.parent) {
      if (path.value && path.value.type == 'TypeofTypeAnnotation') {
        return false;
      }
    }
    return true;
  }

  // main
  //
  if (file.source.indexOf('@generated') == -1 &&
      (fileName.endsWith('.js.flow') || file.source.indexOf('@flow') >= 0)
      && hasErrors(fileName)) {
    let processed = 0;
    let root = j(file.source);
    root.find(j.GenericTypeAnnotation).
      filter(notTypeOf).
      forEach((anno) => {
        if (process(anno))
          processed++;
      }
    );
    return processed > 0 ? root.toSource() : null;
  } else {
    return null;
  }
}

module.exports = transform;
