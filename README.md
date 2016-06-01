# flow-codemod

This repository contains a collection of codemod scripts for use with
[JSCodeshift](https://github.com/facebook/jscodeshift) that help update
Flowified JS code.

### Setup & Run

  * `npm install -g jscodeshift`
  * `git clone https://github.com/flowtype/flow-codemod.git`
  * `jscodeshift -t <codemod-script> <path>`
	(but note that individual transforms may require additional options, as documented below)
  * Use the `-d` option for a dry-run and use `-p` to print the output for comparison

### Included Scripts

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

##### USAGE

*	Generating Flow errors:

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

*	Running the transform:

	Run the transform with the following jscodeshift command line:

	```
	jscodeshift
		-t flow-codemod/transforms/strict-type-args.js
		<path/to/project/>
		--errors=<path/to/errorfile.json>
		--extensions=js,flow
	```

##### Known Issues

1. jscodeshift uses currently uses Babel 5, which fails to parse certain JS idioms.
Files that fail to parse will not be transformed, unfortunately.

2. The Flow and Babel 5 parsers sometimes disagree on the position of expressions
due to tab expansion. If certain type annotations fail to convert even when the
files are successfully parsed - in particular, if other annotations within the
same file convert successfully - try converting tabs to spaces and rerunning the
transform.
