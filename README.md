# flow-codemod

This repository contains a collection of codemod scripts for use with
[JSCodeshift](https://github.com/facebook/jscodeshift) that help update
Flowified JS code.

### Setup & Run

  * `npm install -g jscodeshift`
  * `git clone https://github.com/flowtype/flow-codemod.git`
  * `jscodeshift -t <codemod-script> <path>`
	(but note that individual transforms may require additional options, as documented)
  * Use the `-d` option for a dry-run and use `-p` to print the output for comparison

### Included Scripts

The following codemods and docs can be found in the `transforms` directory.

#### `strict-type-args`

Adds explicit arguments to polymorphic type application expressions,
based on errors from Flow. For example,

```
let map: Map = ...
```

...becomes

```
let map: Map<any, any> = ...
```

`any` is used for all inserted type arguments, duplicating the implicit
previous behavior.
