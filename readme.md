[![npm version](https://badge.fury.io/js/@karmaniverous%2Fs3-streamlogger.svg)](https://badge.fury.io/js/@karmaniverous%2Fs3-streamlogger)

## THIS IS A TYPESCRIPT REFACTOR!

This project is a Typescript refactor of the original [s3-streamlogger](http://github.com/coggle/s3-streamlogger) package. It has a modern project architecture & features a couple of minor tweaks, but is otherwise a drop-in replacement for the original package.

Key changes:

- It's a Typescript project now. Fully type-safe, and supports both `import` and `require`.

- I eliminated the [`git-branch`](https://github.com/jonschlinkert/git-branch) dependency, which was generating a lot of dependency warnings. If you need your branch name as part of `name-format`, you can inject it.

- I added an [`assumeRole`](https://github.com/karmaniverous/s3-streamlogger/blob/d6d346fbd309ae7ac0e8dfdc1d80b506f436fa4e/src/S3StreamLogger.ts#L113-L136) method that allows you to assume an IAM role while writing to your bucket. This function takes an [`AssumeRoleRequest`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/AssumeRoleCommand/) object as its sole argument and is VERY useful if you are writing to a central audit bucket in another account!

- The `S3StreamTransport` export is a Winston transport. All the usual options apply, and the class also exposes the `assumeRole` method of the underlying `S3StreamLogger`. This is useful if you are using Winston for logging.

Use `assumeRole`` like this:

```ts
import { S3StreamLogger } from '@karmaniverous/s3-streamlogger';

const s3stream = new S3StreamLogger({ bucket: 'mys3bucket' });

await s3stream.assumeRole({
  RoleArn: 'arn:aws:iam::123456789012:role/MyRole',
  RoleSessionName: 'my-session',
});

s3stream.write('hello S3');
```

If you have appropriate permissions in place, this should just work.

The original project had no unit tests, and this one still doesn't. If you feel like contributing, all of the machinery is there, see [this template](https://github.com/karmaniverous/npm-package-template-ts) for more info.

**The original README follows. I have NOT refactored it yet, so wherever you see a `require` statement below, feel free to use an `import`.**

## s3-streamlogger

A Writable Stream object that uploads to s3 objects, periodically rotating to a
new object name.

See also [tails3](http://github.com/coggle/tails3) for a script to tail the log
files produced by s3-streamlogger.

### Installation

```bash
npm install --save s3-streamlogger
```

### Basic Usage

```js
const { S3StreamLogger } = require('s3-streamlogger');

const s3stream = new S3StreamLogger({
  bucket: 'mys3bucket',
});

s3stream.write('hello S3');
```

### Use with Winston: Log to S3

```sh
npm install --save winston
npm install --save s3-streamlogger
```

```js
const winston = require('winston');
const { S3StreamLogger } = require('s3-streamlogger');

const s3_stream = new S3StreamLogger({
  bucket: 'mys3bucket',
});

const transport = new winston.transports.Stream({
  stream: s3_stream,
});
// see error handling section below
transport.on('error', function (err) {
  /* ... */
});

const logger = winston.createLogger({
  transports: [transport],
});

logger.info('Hello Winston!');
```

### Define subfolder

```js
const { S3StreamLogger } = require('s3-streamlogger');

const s3stream = new S3StreamLogger({
  bucket: 'mys3bucket',
  folder: 'my/nested/subfolder',
});

s3stream.write('hello S3');
```

### Assign tags

```js
const { S3StreamLogger } = require('s3-streamlogger');

const s3stream = new S3StreamLogger({
  bucket: 'mys3bucket',
  folder: 'my/nested/subfolder',
  tags: { type: 'myType', project: 'myProject' },
});

s3stream.write('hello S3');
```

### Add hostname information for tails3

tails3 expects messages to be logged as json (the default for the file
transport), with hostname and (for critical errors), stack properties to each
log object, in addition to the standard timestamp, level and message
properties. You can provide these using the third "metadata" option to
winston's log method:

```js
logger.log(level, message, {hostname: ... , stack: ...});
```

### Handling logging errors

When there is an error writing to s3, the stream emits an 'error' event with
details. You should take care **not** to log these errors back to the same
stream (as that is likely to cause infinite recursion). Instead log them to the
console, to a file, or to SNS using [winston-sns](https://github.com/jesseditson/winston-sns).

Note that these errors will result in uncaught exceptions unless you have an
`error` event handler registered, for example:

```js
s3_stream.on('error', function (err) {
  // there was an error!
  some_other_logging_transport.log('error', 'logging transport error', err);
});
```

When using s3-streamlogger with the Winston Stream transport, the Stream transport
attaches its own error handler to the stream, so you do not need your own,
however it will re-emit the errors on itself which must be handled instead:

```js
const transport = new winston.transports.Stream({
  stream: s3_stream,
});
transport.on('error', function (err) {
  /* handle s3 stream errors (e.g. invalid credentials, EHOSTDOWN) here */
});

const logger = winston.createLogger({
  transports: [transport],
});
```

### Options

#### bucket _(required)_

Name of the S3 bucket to upload data to. Must exist.
Can also be provided as the environment variable `BUCKET_NAME`.

#### folder

An optional folder to stream log files to. Takes a path string,
eg: "my/subfolder" or "nested".

#### tags

An optional set of tags to assign to the log files. Takes an object,
eg: `{type: "myType"}` or `{type: "myType", project: "myProject"}`.

#### access*key_id \_deprecated*

AWS access key ID, must have putObject permission on the specified bucket. Provide
credentials through the environment variable `AWS_ACCESS_KEY_ID`, or as any
of the other [authentication
methods](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
supported by the AWS SDK instead.

#### secret*access_key \_deprecated*

AWS secret key for the `access_key_id` specified. Provide
credentials through the environment variable `AWS_SECRET_ACCESS_KEY`, or as any
of the other [authentication
methods](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
supported by the AWS SDK instead.

#### config

Configuration object for the AWS SDK. The full list of options is available on the [AWS SDK Configuration page](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/global-config-object.html). This is an alternative to using access_key_id and secret_access_key and is overwritten by them if both are used.

#### name_format

Format of file names to create, accepts [strftime specifiers](https://github.com/samsonjs/strftime). Defaults to `"%Y-%m-%d-%H-%M-%S-%L-<current git branch>-<hostname>.log"`. The Date() used to fill the format specifiers is created with the current UTC time, but still _has the current timezone_, so any specifiers that perform timezone conversion will return incorrect dates.

If you use a format of the form `%Y-%m-%d-%H-%M-<stage>-<hostname>.log`, then
you can use [tails3](http://github.com/coggle/tails3) to tail the log files
being generated by `S3StreamLogger`.

If `compress` is set to true, then the default extension is `.log.gz` instead of
`.log`.

#### rotate_every

Files will be rotated every `rotate_every` milliseconds. Defaults to 3600000 (60
minutes).

#### max_file_size

Files will be rotated when they reach `max_file_size` bytes. Defaults to 200000 (i.e. 200 KB).

#### upload_every

Files will be uploaded every `upload_every` milliseconds. Defaults to 20
seconds.

#### buffer_size

Files will be uploaded if the un-uploaded data exceeds `buffer_size` bytes.
Defaults to 10 KB.

#### server_side_encryption

The server side encryption `AES256` algorithm used when storing objects in S3.
Defaults to false.

#### storage_class

The S3 StorageClass (STANDARD, REDUCED_REDUNDANCY, etc.). If omitted, no value
is used and aws-sdk will fill in its default.

#### acl

The canned ACL (access control list) to apply to uploaded objects.
Defaults to no ACL.

#### compress

If true, the files will be gzipped before uploading (may reduce s3 storage costs).
Defaults to false.

### License

[ISC](http://opensource.org/licenses/ISC): equivalent to 2-clause BSD.
