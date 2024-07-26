# This repo is deprecated (for now)!

Ran into some issues at the same time I found a better implementation path for the project this thing was meant to support. So consider it back-burnered.

## Low-Impact S3 Logging

`S3StreamLogger` is a Writable Stream class that collects & asynchronously uploads log data to an S3 bucket, periodically rotating to a new object name. The class supports assumption of an IAM role, assuming necessary permissions are in place.

`S3StreamTransport` wraps `S3StreamLogger` into a [`winston` transport](https://github.com/winstonjs/winston/blob/master/docs/transports.md) for an easy developer experience. See below for an implementation example.

This project is a TypeScript refactor of the original [`s3-streamlogger`](http://github.com/coggle/s3-streamlogger) package. It has a modern project architecture and offers some new features, **but is otherwise a drop-in replacement for the original package!**

## Using `S3StreamLogger`

```ts
import { S3StreamLogger } from '@karmaniverous/s3-streamlogger';

// Create an instance of the class. The bucket name is required.
// All arguments are as in the original package.
const streamLogger = new S3StreamLogger({ bucket: 'my-bucket' });

// Optionally, assume an IAM role before writing to the bucket.
await streamLogger.assumeRole({
  RoleArn: 'arn:aws:iam::123456789012:role/MyRole',
  RoleSessionName: 'my-session',
});

// Write to the stream as you would with any other Writable Stream.
streamLogger.write('hello S3');
```

The argument to the `assumeRole` method an [`AssumeRoleRequest`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/AssumeRoleCommand/) object.

## Using `S3StreamTransport`

```ts
// Create an instance of the transport. The first parameter is an
// S3StreamLoggerOptions object, and the second is a winston
// TransportStreamOptions object.
s3StreamTransport = new S3StreamTransport(
  { bucket: 'my-bucket' },
  {
    // Throw in a timestamp & environment variables for context.
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format((info) => ({
        ...info,
        env: process.env,
      }))(),
    ),

    // Only log messages of imaginary level 'audit' and above.
    level: 'audit',
  },
);

// Optionally, assume an IAM role.
await s3StreamTransport.assumeRole({
  RoleArn: 'arn:aws:iam::123456789012:role/MyRole',
  RoleSessionName: 'my-session',
});

// Create your logger.
const logger = winston.createLogger({
  transports: [new winston.transports.Console(), s3StreamTransport],
});

// Log a message just to your console.
logger.info('foo');

// Log a message to your console AND your S3 bucket.
logger.audit('bar');
```

Follow these links for details on [`S3StreamLoggerOptions`](./src/S3StreamLogger.ts) and [`TransportStreamOptions`](https://github.com/winstonjs/winston-transport/blob/master/index.d.ts).

## More Info

Please refer to the original [s3-streamlogger](http://github.com/coggle/s3-streamlogger) project for more info on arguments & options!

---

See more great templates and other tools on
[my GitHub Profile](https://github.com/karmaniverous)!
