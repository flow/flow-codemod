### `strict-type-args`

#### What this codemod is for

Running this codemod will convert implicit polymorphic type applications into explicit ones - this prepares code for Flow's upcoming switch to strict type argument processing.

###### Sidebar:
* “Polymorphic type application” describes a type expression like `Promise<string>`, which applies the type argument string to the polymorphic type `Promise`.
* "in annotations" is important because this rule change does not include value expressions, such as references to polymorphic classes in runtime code, or calls to polymorphic functions.

Up to now, Flow would let you use polymorphic types without arguments (e.g., simply `Promise`) and silently fill in the missing arguments with `any` to make a type application. While this behavior made certain annotations a bit more concise, it also lead to lots of confusion: among other things,
* `any` isn’t a self-evident choice of default  - for example, it’s easy to assume that argument types are being inferred instead
* `any` can suppress errors in surprising ways, and being invisible makes its effects even harder to spot
* a lack of type arguments can make it non-obvious that a type is polymorphic at all.

To illustrate the problem, here’s some code that Flow currently signs off on:
```
var set: Set = new Set();               // set's type is actually Set<any>, so
set.add('x');                           // even though this happens,
for (const n: number of set.values()) { // this produces no error.
  // land of broken promises
}
```
With the new rule, here’s the error you’d get for this code:
```
var set: Set = new Set();
         ^^^ Set. Application of polymorphic type needs <list of 1 argument>.
```

This codemod prepares existing code for this rule change by manifesting the implicit `any` type arguments explicitly, based on errors generated from Flow. For example,

```
let map: Map = ...
```

...becomes

```
let map: Map<any, any> = ...
```

`any` is used for all inserted type arguments, duplicating the implicit previous behavior exactly. However, these `any` arguments can often be replaced with something better: see **Post-codemod options**, below.

#### Running the codemod

* Generate Flow errors:

    This transform is driven by a Flow error set.

    To generate the necessary errors, you must be running Flow version 0.25
    or above. Currently the error is disabled by default; enable it by adding
    the following line to your `.flowconfig`:

    ```
    [options]
    experimental.strict_type_args=true
    ```

    (This error will be enabled by default in an upcoming version.)

    With this config in place, run the following command to generate a JSON
    error file for the transform to use:

    ```
    flow <path/to/project> --show-all-errors --json > <path/to/errorfile.json>
    ```

* Run the transform:

    Run the transform with the following `jscodeshift` command line:

    ```
    jscodeshift
        -t flow-codemod/transforms/strict-type-args/strict-type-args.js
        <path/to/project/>
        --errors=<path/to/errorfile.json>
        --extensions=js,flow
    ```

###### KNOWN ISSUES

1. jscodeshift currently uses Babel 5, which fails to parse certain JS idioms.
Files that fail to parse will not be transformed, unfortunately.

2. The Flow and Babel 5 parsers sometimes disagree on the position of expressions
due to tab expansion. If certain type annotations fail to convert even when the
files are successfully parsed - in particular, if other annotations within the
same file convert successfully - try [converting tabs to spaces](http://i.imgur.com/qx2VUgo.gif) and rerunning the
transform.

#### Post-codemod options

The goal of this codemod is to avoid new errors in existing code, but leave all other type checking completely unchanged. So it's very conservative, simply replacing the invisible `any` type arguments with visible ones.

Of course, in many cases Flow will do more and better checking if you use something besides `any`. The rest of this note is a quick guide to your choices in common situations.

##### Use a concrete type

In the example we started with, `set`’s type is obviously `Set<string>`, and saying so is all upside. This is the thing to do if the “meaning” of the type parameter(s) is clear (in the sense of, “Set’s type parameter is the type of elements in the set”), and you can express the argument type(s) conveniently.

##### Use `*`

In cases where it’s either unclear what the type argument “should” be, or inconvenient to express it, a second option is to use `*`. This tells Flow to use whatever type has been inferred from context - for example, using `Set<*>` above will give you exactly the same type errors as `Set<string>`.

##### Use `any`

There are some situations where specifying any as a type argument is really your best option. These are broadly the same kinds of situations where any is a reasonable choice at the top level: where things are too variable, or dynamic, to express a strict type practically.

##### React

For React code, it's often convenient (and not harmful to client code safety) to leave the any arguments in place.

A pervasive example is the return type of `render()`: post-codemod code will look like this:
```
render(): React.Element<any> { ... }
```
`React.Element`'s type parameter describes the element's properties. But there's typically no safety benefit to describing this with a concrete type, because client code doesn't normally use the value returned by `render()`.
Also, since a Component's properties are decoupled from the properties of the Element(s) produced by render, it isn't simply a matter of sharing a common properties type between the two.

###### Note on React.Element<*>:

If you have an itch to try this (despite its arguable safety benefit per above), bear in mind that while simple cases (for instance, cases where render only returns a single kind of Element, as opposed to conditionally returning one of several choices), will work fine, more variable render methods will sometimes produce Elements with mutually incompatible property shapes, which will cause errors whose root causes can be hard to trace. (The technical tl;dr is basically `React.Element<A> | React.Element<B> != React.Element<A | B>`.)
